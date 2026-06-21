const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  websiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  paymentMethod: { type: String, enum: ['razorpay'], default: 'razorpay' },

  // Razorpay identifiers
  razorpayOrderId:   { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, index: true, sparse: true },
  razorpaySignature: { type: String },

  // Amount (stored in INR, not paise)
  amount:   { type: Number, required: true },
  currency: { type: String, default: 'INR', uppercase: true },

  // Status
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed'],
    default: 'created',
    index: true,
  },

  // Full gateway response for debugging/audit
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },

  // Failure
  failureReason: String,
  failureCode:   String,

}, { timestamps: true });

paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ websiteId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
