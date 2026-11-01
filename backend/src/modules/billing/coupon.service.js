'use strict';

const Coupon = require('../coupons/coupon.model');
const { BillingOrder, CouponRedemption } = require('./models');
const { BillingError } = require('./errors');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

// Effective global cap: explicit maxRedemptions, else 1 for legacy single_global coupons, else unlimited.
const effectiveMax = (coupon) => coupon.maxRedemptions || (coupon.usageMode === 'single_global' ? 1 : null);

/**
 * Loads and validates a coupon for a subscription checkout. Pure validation: it reserves nothing.
 * Every eligibility decision is made here, server-side; the client only ever sends the code.
 */
async function resolveCoupon({ code, userId, planId, interval, now = new Date() }) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon || !Array.isArray(coupon.appliesTo) || !coupon.appliesTo.includes('subscription')) {
    throw new BillingError('COUPON_INVALID', 'That promo code isn’t valid.');
  }
  if (!coupon.active) throw new BillingError('COUPON_INACTIVE', 'This promo code is no longer active.');
  if (coupon.startsAt && now < coupon.startsAt) throw new BillingError('COUPON_INVALID', 'This promo code isn’t active yet.');
  if (coupon.expiresAt && now >= coupon.expiresAt) throw new BillingError('COUPON_EXPIRED', 'This promo code has expired.');
  if (coupon.eligiblePlans?.length && !coupon.eligiblePlans.includes(planId)) {
    throw new BillingError('COUPON_NOT_ELIGIBLE', 'This promo code doesn’t apply to the selected plan.');
  }
  if (coupon.eligibleIntervals?.length && !coupon.eligibleIntervals.includes(interval)) {
    throw new BillingError('COUPON_NOT_ELIGIBLE', `This promo code only applies to ${coupon.eligibleIntervals.join(' / ')} billing.`);
  }

  const max = effectiveMax(coupon);
  if (max !== null && (coupon.redemptionCount || 0) >= max) {
    throw new BillingError('COUPON_EXHAUSTED', 'This promo code has reached its redemption limit.');
  }

  if (coupon.perUserLimit) {
    const used = await CouponRedemption.countDocuments({ couponId: coupon._id, userId, status: { $in: ['reserved', 'redeemed'] } });
    if (used >= coupon.perUserLimit) throw new BillingError('COUPON_USER_LIMIT_REACHED', 'You’ve already used this promo code.');
  }
  if (coupon.firstTimeOnly) {
    const paid = await BillingOrder.exists({ userId, status: 'paid' });
    if (paid) throw new BillingError('COUPON_FIRST_TIME_ONLY', 'This promo code is for first-time subscribers only.');
  }

  return {
    id: coupon._id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscountMinor: coupon.maxDiscountMinor || null,
    minPurchaseMinor: coupon.minPurchaseMinor || null,
    stackableWithAnnualDiscount: Boolean(coupon.stackableWithAnnualDiscount),
    maxRedemptions: effectiveMax(coupon),
    perUserLimit: coupon.perUserLimit || null,
  };
}

/** Atomically reserve one redemption for an order (global cap enforced in the same update). */
async function reserveRedemption({ coupon, userId, orderId, discountMinor }) {
  const filter = { _id: coupon.id, active: true };
  if (coupon.maxRedemptions !== null) filter.redemptionCount = { $lt: coupon.maxRedemptions };
  const claimed = await Coupon.findOneAndUpdate(filter, { $inc: { redemptionCount: 1 } }, { new: true });
  if (!claimed) throw new BillingError('COUPON_EXHAUSTED', 'This promo code has reached its redemption limit.');

  try {
    await CouponRedemption.create({ couponId: coupon.id, userId, orderId, discountMinor, status: 'reserved' });
  } catch (error) {
    await Coupon.updateOne({ _id: coupon.id, redemptionCount: { $gt: 0 } }, { $inc: { redemptionCount: -1 } });
    if (error?.code === 11000) return; // this order already holds a redemption (idempotent retry)
    throw error;
  }

  // Per-user limit, checked after insert so two concurrent checkouts cannot both slip past it.
  if (coupon.perUserLimit) {
    const held = await CouponRedemption.countDocuments({ couponId: coupon.id, userId, status: { $in: ['reserved', 'redeemed'] } });
    if (held > coupon.perUserLimit) {
      await releaseRedemption(orderId);
      throw new BillingError('COUPON_USER_LIMIT_REACHED', 'You’ve already used this promo code.');
    }
  }
}

/** reserved -> released (frees the global slot). No-op unless currently reserved. */
async function releaseRedemption(orderId) {
  const released = await CouponRedemption.findOneAndUpdate({ orderId, status: 'reserved' }, { $set: { status: 'released' } });
  if (released) await Coupon.updateOne({ _id: released.couponId, redemptionCount: { $gt: 0 } }, { $inc: { redemptionCount: -1 } });
  return Boolean(released);
}

/** reserved -> redeemed once payment is confirmed. A hold that already lapsed is re-taken (money was captured). */
async function redeemRedemption(orderId) {
  const redeemed = await CouponRedemption.findOneAndUpdate({ orderId, status: 'reserved' }, { $set: { status: 'redeemed' } });
  if (redeemed) return true;
  const lapsed = await CouponRedemption.findOneAndUpdate({ orderId, status: 'released' }, { $set: { status: 'redeemed' } });
  if (lapsed) await Coupon.updateOne({ _id: lapsed.couponId }, { $inc: { redemptionCount: 1 } });
  return Boolean(lapsed);
}

module.exports = { normalizeCode, resolveCoupon, reserveRedemption, releaseRedemption, redeemRedemption, effectiveMax };
