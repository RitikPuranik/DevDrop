const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Purchase reference (optional - created after payment)
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: false, // ← Made optional (created later)
  },
  
  // Website and buyer references
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
  
  // Stripe payment details
  stripePaymentIntentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  stripeChargeId: {
    type: String,
    index: true,
  },
  stripeCustomerId: String,
  
  // Amount details
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true,
  },
  
  // Payment status
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed', 'refunded'],
    default: 'created',
    index: true,
  },
  
  // Stripe response data
  stripeResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  // Refund details
  refundId: String,
  refundAmount: Number,
  refundReason: String,
  refundedAt: Date,
  
  // Payment failure details
  failureReason: String,
  failureCode: String,
  
  // Metadata
  paymentMethod: String,
  paymentEmail: String,
  
}, {
  timestamps: true,
});

// Indexes for better performance
// paymentSchema.index({ stripePaymentIntentId: 1 });
// paymentSchema.index({ stripeChargeId: 1 });
paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ websiteId: 1 });
// paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);