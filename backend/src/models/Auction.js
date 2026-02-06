const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  // Website reference
  websiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Website',
    required: true,
    unique: true,
    index: true,
  },
  
  // Auction timing
  startTime: {
    type: Date,
    required: true,
    default: Date.now,
  },
  
  // Bidding details
  startingPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  minimumBidIncrement: {
    type: Number,
    default: 100,
  },
  
  // First bid tracking
  firstBidPlacedAt: {
    type: Date,
    index: true,
  },
  firstBidWaitingPeriodHours: {
    type: Number,
    default: 72, // 3 days in hours
  },
  firstBidDeadline: {
    type: Date,
    index: true,
  },
  
  // Current bid tracking
  currentBidId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid',
  },
  currentBidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  currentBidAmount: {
    type: Number,
    default: 0,
  },
  lastBidPlacedAt: {
    type: Date,
  },
  
  // Auction status
  status: {
    type: String,
    enum: [
      'active',              // Accepting bids
      'first_bid_waiting',   // First bid placed, waiting 3 days
      'awaiting_payment',    // Bidder won, must pay in 3 days
      'payment_failed',      // Bidder didn't pay
      'completed',           // Payment received, website sold
      'cancelled'            // Cancelled by admin
    ],
    default: 'active',
    index: true,
  },
  
  // Payment window
  paymentDeadline: {
    type: Date,
    index: true,
  },
  paymentReminderSent: {
    type: Boolean,
    default: false,
  },
  
  // Statistics
  totalBids: {
    type: Number,
    default: 0,
  },
  uniqueBidders: {
    type: Number,
    default: 0,
  },
  
  // Reserve price (optional - minimum price to sell)
  reservePrice: {
    type: Number,
    default: 0,
  },
  reserveMet: {
    type: Boolean,
    default: false,
  },
  
  // Re-auction tracking
  previousAttempts: [{
    bidderId: mongoose.Schema.Types.ObjectId,
    bidAmount: Number,
    failedAt: Date,
    failureReason: String,
  }],
  attemptNumber: {
    type: Number,
    default: 1,
  },
  
}, {
  timestamps: true,
});

// Indexes
auctionSchema.index({ status: 1, firstBidDeadline: 1 });
auctionSchema.index({ status: 1, paymentDeadline: 1 });
auctionSchema.index({ currentBidderId: 1, status: 1 });

// Virtual for checking if first bid waiting period expired
auctionSchema.virtual('isFirstBidWaitingExpired').get(function() {
  if (!this.firstBidDeadline) return false;
  return new Date() >= this.firstBidDeadline;
});

// Virtual for checking if payment deadline passed
auctionSchema.virtual('isPaymentDeadlineExpired').get(function() {
  if (!this.paymentDeadline) return false;
  return new Date() >= this.paymentDeadline;
});

// Method to check if payment deadline passed
auctionSchema.methods.hasPaymentDeadlinePassed = function() {
  if (!this.paymentDeadline) return false;
  return new Date() > this.paymentDeadline;
};

// Method to check if first bid waiting period passed
auctionSchema.methods.hasFirstBidWaitingPassed = function() {
  if (!this.firstBidDeadline) return false;
  return new Date() > this.firstBidDeadline;
};

module.exports = mongoose.model('Auction', auctionSchema);