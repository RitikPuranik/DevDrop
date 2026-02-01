const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
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
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Stripe details
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
  },
  stripeChargeId: String,
  stripeTransferId: String, // Transfer ID to seller
  
  // Amount details
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  
  // Status
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed', 'refunded'],
    default: 'created',
  },
  
  // Additional Stripe response data
  stripeResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  // Refund details
  refundId: String,
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  
  // Metadata
  paymentMethod: String,
  paymentEmail: String,
  
}, {
  timestamps: true,
});

// Indexes
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ stripeChargeId: 1 });
paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);