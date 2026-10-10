const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    usageMode: {
      type: String,
      enum: ['single_global', 'reusable'],
      required: true,
    },
    discountType: {
      type: String,
      enum: ['percent', 'flat'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    consumedByPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    consumedByPurchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null,
    },
    reservedByPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    reservedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reservationExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
