const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Purchase reference (optional - created after payment)
  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: false,
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
  
  // Payment gateway
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'stripe'],
    default: 'razorpay',
  },
  
  // Razorpay payment details
  razorpayOrderId: {
    type: String,
    index: true,
    sparse: true,
  },
  razorpayPaymentId: {
    type: String,
    index: true,
    sparse: true,
  },
  razorpaySignature: String,
  
  // Keep for backward compatibility during migration
  stripePaymentIntentId: {
    type: String,
    index: true,
    sparse: true,
  },
  stripeChargeId: {
    type: String,
    index: true,
    sparse: true,
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
  
  // Gateway response data
  razorpayResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
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
  paymentEmail: String,
  
}, {
  timestamps: true,
});

// Indexes for better performance
paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ websiteId: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);