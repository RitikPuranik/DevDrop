'use strict';

const { BillingError } = require('./errors');
const { MONTHS } = require('./plans.config');

/**
 * Money is always an INTEGER number of minor units (paise). Percentages are INTEGER basis points
 * (1% = 100 bps). The only rounding rule: half-up at the single division in each step.
 */
const MIN_CHARGEABLE_MINOR = 100; // Razorpay's minimum order amount (₹1)

const assertInt = (n, name) => {
  if (!Number.isSafeInteger(n)) throw new Error(`${name} must be an integer number of minor units`);
  return n;
};
// round-half-up of amount * bps / 10000, in integer arithmetic only
const percentOf = (amountMinor, bps) => {
  assertInt(amountMinor, 'amountMinor'); assertInt(bps, 'bps');
  return Math.floor((amountMinor * bps + 5000) / 10000);
};

/** Absolute coupon discount (minor units) on `baseMinor`, before the maxDiscount / base caps. */
function couponDiscountFor(coupon, baseMinor) {
  if (coupon.discountType === 'percent') return percentOf(baseMinor, Math.round(Number(coupon.discountValue) * 100));
  // Existing coupons store flat amounts in whole rupees; convert once to minor units.
  return Math.round(Number(coupon.discountValue) * 100);
}

/**
 * The single authoritative price calculation. Order: list price -> annual discount -> coupon -> proration credit -> tax.
 * @param {object} p
 * @param {object} p.plan        plan from plans.config
 * @param {'monthly'|'yearly'} p.interval
 * @param {object|null} p.coupon  normalized coupon ({ code, discountType, discountValue, maxDiscountMinor, minPurchaseMinor, stackableWithAnnualDiscount })
 * @param {number} p.creditMinor  proration credit for unused time on a plan being replaced
 * @param {object} p.settings     billing settings (tax config)
 */
function computeQuote({ plan, interval, coupon = null, creditMinor = 0, settings }) {
  if (!MONTHS[interval]) throw new BillingError('INVALID_BILLING_INTERVAL', 'Choose monthly or yearly billing.');
  if (!plan.purchasable) throw new BillingError('PLAN_NOT_AVAILABLE', 'This plan cannot be purchased.');
  const months = MONTHS[interval];

  const listPriceMinor = assertInt(plan.monthlyPriceMinor * months, 'listPrice');
  const annualDiscountBps = interval === 'yearly' ? plan.annualDiscountBps : 0;
  const annualDiscountMinor = percentOf(listPriceMinor, annualDiscountBps);
  const afterAnnualMinor = listPriceMinor - annualDiscountMinor;

  let couponDiscountMinor = 0;
  let couponSummary = null;
  if (coupon) {
    if (annualDiscountMinor > 0 && !coupon.stackableWithAnnualDiscount) {
      throw new BillingError('COUPON_NOT_STACKABLE', 'This coupon cannot be combined with the yearly billing discount.');
    }
    if (coupon.minPurchaseMinor && afterAnnualMinor < coupon.minPurchaseMinor) {
      throw new BillingError('COUPON_MIN_PURCHASE_NOT_MET', 'This order is below the minimum amount required for this coupon.');
    }
    let raw = couponDiscountFor(coupon, afterAnnualMinor);
    const capped = [];
    if (coupon.maxDiscountMinor && raw > coupon.maxDiscountMinor) { raw = coupon.maxDiscountMinor; capped.push('maxDiscount'); }
    if (raw > afterAnnualMinor) { raw = afterAnnualMinor; capped.push('orderTotal'); }
    couponDiscountMinor = raw;
    couponSummary = {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountMinor: couponDiscountMinor,
      cappedBy: capped,
      stackedWithAnnualDiscount: annualDiscountMinor > 0,
    };
  }
  const afterCouponMinor = afterAnnualMinor - couponDiscountMinor;

  const creditAppliedMinor = Math.min(Math.max(0, creditMinor), afterCouponMinor);
  const payableBeforeTaxMinor = afterCouponMinor - creditAppliedMinor;

  const tax = settings.tax;
  let taxMinor = 0;
  let totalMinor = payableBeforeTaxMinor;
  if (payableBeforeTaxMinor > 0 && tax.mode === 'exclusive') {
    taxMinor = percentOf(payableBeforeTaxMinor, tax.percentBps);
    totalMinor = payableBeforeTaxMinor + taxMinor;
  } else if (payableBeforeTaxMinor > 0 && tax.mode === 'inclusive') {
    taxMinor = payableBeforeTaxMinor - Math.floor((payableBeforeTaxMinor * 10000 + Math.floor((10000 + tax.percentBps) / 2)) / (10000 + tax.percentBps));
  }
  totalMinor += settings.platformFeeMinor;
  if (totalMinor > 0 && totalMinor < MIN_CHARGEABLE_MINOR) {
    throw new BillingError('CHECKOUT_AMOUNT_INVALID', 'This combination results in an amount below the minimum chargeable amount. Try a different coupon.');
  }

  return {
    currency: settings.currency,
    planId: plan.id,
    interval,
    months,
    monthlyPriceMinor: plan.monthlyPriceMinor,
    listPriceMinor,
    annualDiscountBps,
    annualDiscountMinor,
    afterAnnualDiscountMinor: afterAnnualMinor,
    coupon: couponSummary,
    couponDiscountMinor,
    creditAppliedMinor,
    platformFeeMinor: settings.platformFeeMinor,
    tax: { mode: tax.mode, label: tax.label, percentBps: tax.percentBps, amountMinor: taxMinor, inclusive: tax.mode === 'inclusive' },
    netBeforeTaxMinor: payableBeforeTaxMinor,
    totalMinor,
    monthlyEquivalentMinor: Math.floor((afterAnnualMinor * 2 + months) / (2 * months)), // display only, half-up
    requiresPayment: totalMinor > 0,
  };
}

module.exports = { percentOf, couponDiscountFor, computeQuote, MIN_CHARGEABLE_MINOR };
