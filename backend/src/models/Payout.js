const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: true,
  },
  websiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Website',
    required: true,
  },
  
  // Amount (seller's price only, no platform fee/tax)
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Bank details snapshot (at time of payout)
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String,
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  
  // Razorpay payout details
  razorpayPayoutId: String,
  razorpayTransferId: String,
  
  // Transaction details
  utr: String, // Unique Transaction Reference
  transactionDate: Date,
  
  // Admin tracking
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  processedAt: Date,
  
  // Failure details
  failureReason: String,
  
  // Notes
  adminNotes: String,
  
}, {
  timestamps: true,
});

// Compound indexes
payoutSchema.index({ sellerId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ purchaseId: 1 });

module.exports = mongoose.model('Payout', payoutSchema);