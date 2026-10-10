const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  // References
  websiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Website',
    required: true,
    index: true,
  },
  bidderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Bid details
  bidAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  
  // Bid status
  status: {
    type: String,
    enum: ['active', 'outbid', 'winning', 'won', 'lost', 'expired', 'cancelled'],
    default: 'active',
    index: true,
  },
  
  // Auto-bid settings (optional feature)
  isAutoBid: {
    type: Boolean,
    default: false,
  },
  maxAutoBidAmount: {
    type: Number,
  },
  
  // Timestamps
  bidPlacedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Notes
  bidderNotes: String,
  
}, {
  timestamps: true,
});

// Compound indexes
bidSchema.index({ websiteId: 1, status: 1, bidAmount: -1 });
bidSchema.index({ bidderId: 1, status: 1, createdAt: -1 });
bidSchema.index({ websiteId: 1, bidderId: 1 });

// Method to check if bid is still active
bidSchema.methods.isActive = function() {
  return this.status === 'active' || this.status === 'winning';
};

module.exports = mongoose.model('Bid', bidSchema);