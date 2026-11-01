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

    // ---- Subscription-checkout rules (all optional; existing marketplace coupons are unaffected) ----
    // Which checkout the coupon can be used in. Missing/legacy coupons behave as marketplace-only.
    appliesTo: {
      type: [String],
      enum: ['marketplace', 'subscription'],
      default: undefined,
    },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    maxRedemptions: { type: Number, default: null, min: 1 }, // global cap; single_global implies 1 when unset
    redemptionCount: { type: Number, default: 0, min: 0 }, // subscription redemptions (reserved + redeemed)
    perUserLimit: { type: Number, default: null, min: 1 },
    minPurchaseMinor: { type: Number, default: null, min: 0 },
    maxDiscountMinor: { type: Number, default: null, min: 0 },
    eligiblePlans: { type: [String], default: undefined }, // e.g. ['pro'] (empty/missing = all paid plans)
    eligibleIntervals: { type: [String], default: undefined }, // e.g. ['monthly']
    firstTimeOnly: { type: Boolean, default: false },
    stackableWithAnnualDiscount: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
