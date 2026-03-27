const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  websiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  paymentMethod: { type: String, enum: ['cashfree'], default: 'cashfree' },

  // Cashfree identifiers
  cashfreeOrderId:   { type: String, index: true, sparse: true },
  cashfreePaymentId: { type: String, index: true, sparse: true },
  cashfreeSessionId: String, // payment_session_id used by frontend SDK

  // Amount
  amount:   { type: Number, required: true },
  currency: { type: String, default: 'INR', uppercase: true },

  // Status
  status: {
    type: String,
    enum: ['created', 'processing', 'succeeded', 'failed', 'refunded'],
    default: 'created',
    index: true,
  },

  // Gateway response
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },

  // Refund
  refundId:     String,
  refundAmount: Number,
  refundReason: String,
  refundedAt:   Date,

  // Failure
  failureReason: String,
  failureCode:   String,

}, { timestamps: true });

paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ websiteId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
