const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  websiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  paymentMethod: { type: String, enum: ['razorpay', 'coupon'], default: 'razorpay' },

  // Pricing snapshot
  sellerPrice: { type: Number, required: true, min: 0 },
  platformFee: { type: Number, required: true, min: 0 },
  tax:         { type: Number, required: true, min: 0 },
  totalPaid:   { type: Number, required: true, min: 0 },
  platformCommission: { type: Number, default: 0, min: 0 },
  subtotalBeforeDiscount: { type: Number, default: 0, min: 0 },
  discountAmount:         { type: Number, default: 0, min: 0 },
  subtotalAfterDiscount:  { type: Number, default: 0, min: 0 },
  originalTotalPaid:      { type: Number, default: 0, min: 0 },

  // Coupon snapshot
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null,
  },
  couponCode: String,
  discountType: {
    type: String,
    enum: ['percent', 'flat'],
    default: undefined,
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  reservationExpiresAt: {
    type: Date,
    default: null,
  },

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
