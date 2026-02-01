const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  websiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Website',
    required: true,
    index: true,
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['free', 'paid', 'exclusive'],
    required: true,
  },
  
  // Pricing breakdown
  sellerPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  platformFee: {
    type: Number,
    required: true,
    min: 0,
  },
  tax: {
    type: Number,
    required: true,
    min: 0,
  },
  totalPaid: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Payment details (for paid/exclusive only)
  stripePaymentIntentId: String,
  stripeChargeId: String,
  stripeTransferId: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: function() {
      return this.category === 'free' ? 'completed' : 'pending';
    },
  },
  
  // Access tracking
  downloadCount: {
    type: Number,
    default: 0,
  },
  lastAccessedAt: Date,
  
  // Metadata
  purchaseDate: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes for queries
purchaseSchema.index({ buyerId: 1, purchaseDate: -1 });
purchaseSchema.index({ sellerId: 1, purchaseDate: -1 });
purchaseSchema.index({ websiteId: 1, buyerId: 1 }); // Prevent duplicate purchases

// Ensure buyer doesn't purchase same website twice
purchaseSchema.index({ websiteId: 1, buyerId: 1 }, { unique: true });

// Virtual for checking if purchase is complete
purchaseSchema.virtual('isCompleted').get(function() {
  return this.paymentStatus === 'completed';
});

module.exports = mongoose.model('Purchase', purchaseSchema);