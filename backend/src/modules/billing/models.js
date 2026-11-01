'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One subscription document per user (unique userId) => a user can never hold two subscriptions.
 * Stored status is only 'active' | 'expired'; "cancelling" and "grace" are derived (see entitlement.service).
 * The payment provider (Razorpay) stays the authority on money movement; this is the local entitlement record.
 */
const subscriptionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  planId: { type: String, enum: ['pro', 'plus'], required: true },
  interval: { type: String, enum: ['monthly', 'yearly'], required: true },
  status: { type: String, enum: ['active', 'expired'], default: 'active', index: true },
  endReason: { type: String, enum: ['expired', 'cancelled', null], default: null },
  termStart: { type: Date, required: true },
  currentPeriodEnd: { type: Date, required: true, index: true },
  // Quota windows are calendar months counted from this anchor (reset on activation and plan change, kept across renewals).
  quotaAnchor: { type: Date, required: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null },
  lastOrderId: { type: Schema.Types.ObjectId, ref: 'BillingOrder', default: null },
  lastPaidMinor: { type: Number, default: 0 },
  lastTermMs: { type: Number, default: 0 },
}, { timestamps: true });

/** A checkout/order. Amounts are a server-side snapshot of the quote; the client never supplies them. */
const billingOrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  planId: { type: String, enum: ['pro', 'plus'], required: true },
  interval: { type: String, enum: ['monthly', 'yearly'], required: true },
  kind: { type: String, enum: ['new', 'renewal', 'upgrade'], required: true },
  status: { type: String, enum: ['created', 'paid', 'failed', 'cancelled', 'expired'], default: 'created', index: true },
  currency: { type: String, default: 'INR' },
  quote: { type: Schema.Types.Mixed, required: true },
  amountMinor: { type: Number, required: true, min: 0 },
  quoteKey: { type: String, index: true }, // dedupes identical open checkouts (no double orders)
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', default: null },
  couponCode: { type: String, default: null },
  razorpayOrderId: { type: String, unique: true, sparse: true },
  razorpayPaymentId: { type: String, unique: true, sparse: true },
  failureReason: { type: String, default: null },
  holdExpiresAt: { type: Date, index: true },
  paidAt: { type: Date, default: null },
  appliedAt: { type: Date, default: null }, // set exactly once, atomically, when entitlement is granted (idempotency)
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  receiptUrl: { type: String, default: null },
  processedEventIds: { type: [String], default: [] },
}, { timestamps: true });
billingOrderSchema.index({ userId: 1, createdAt: -1 });

/** Usage counters per quota window. Atomic conditional $inc is what makes quota concurrency-safe. */
const usageCounterSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  windowKey: { type: String, required: true }, // 'free:YYYY-MM' (IST month) | ISO start of the paid quota window
  generationsUsed: { type: Number, default: 0, min: 0 },
  editsUsed: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
usageCounterSchema.index({ userId: 1, windowKey: 1 }, { unique: true });

/**
 * One ledger row per AI job. jobKey is unique => a duplicate dispatch can never double-charge.
 * reserved (counted, job queued/running) -> committed (job completed) | released (job failed/cancelled-before-start).
 */
const generationLedgerSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobKey: { type: String, required: true, unique: true },
  projectId: { type: String, index: true },
  kind: { type: String, enum: ['generate', 'edit'], required: true },
  planId: { type: String, required: true },
  windowKey: { type: String, required: true },
  counted: { type: Boolean, default: true }, // false when no counter was incremented (unlimited paid edits)
  status: { type: String, enum: ['reserved', 'committed', 'released'], default: 'reserved', index: true },
  releasedReason: { type: String, default: null },
}, { timestamps: true });
generationLedgerSchema.index({ userId: 1, kind: 1, createdAt: -1 });

const couponRedemptionSchema = new Schema({
  couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, ref: 'BillingOrder', required: true, unique: true },
  discountMinor: { type: Number, required: true },
  status: { type: String, enum: ['reserved', 'redeemed', 'released'], default: 'reserved', index: true },
}, { timestamps: true });

const reg = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  Subscription: reg('Subscription', subscriptionSchema),
  BillingOrder: reg('BillingOrder', billingOrderSchema),
  UsageCounter: reg('UsageCounter', usageCounterSchema),
  GenerationLedger: reg('GenerationLedger', generationLedgerSchema),
  CouponRedemption: reg('CouponRedemption', couponRedemptionSchema),
};
