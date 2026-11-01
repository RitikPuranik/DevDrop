'use strict';

const crypto = require('crypto');
const { Subscription, BillingOrder } = require('./models');
const { BillingError } = require('./errors');
const { getPlans, getPlan, getBillingSettings, INTERVALS, MONTHS } = require('./plans.config');
const { computeQuote } = require('./money');
const couponService = require('./coupon.service');
const entitlements = require('./entitlement.service');
const razorpay = require('../../services/razorpay.service');

const { addMonths, resolveEntitlement, DAY_MS } = entitlements;
const OPEN_STATUSES = ['created', 'failed'];

// ------------------------------------------------------------------ catalogue

function planPricing(plan, settings) {
  if (!plan.purchasable) return null;
  const out = {};
  for (const interval of INTERVALS) {
    const q = computeQuote({ plan, interval, settings });
    out[interval] = {
      interval,
      months: q.months,
      listPriceMinor: q.listPriceMinor,
      annualDiscountBps: q.annualDiscountBps,
      annualDiscountMinor: q.annualDiscountMinor,
      totalMinor: q.totalMinor,
      monthlyEquivalentMinor: q.monthlyEquivalentMinor,
      savingsMinor: q.annualDiscountMinor,
      chargedUpfront: interval === 'yearly',
    };
  }
  return out;
}

/** Why the user can / cannot choose each plan, from authoritative state. */
function eligibilityFor(plan, ent) {
  const { plan: current, status, subscription } = ent;
  if (!plan.purchasable) return { canPurchase: false, action: plan.id === current.id ? 'current' : 'none', reason: null };
  const paidActive = ['active', 'cancelling', 'grace'].includes(status);
  if (!paidActive) return { canPurchase: true, action: status === 'expired' ? 'resubscribe' : 'subscribe', reason: null };
  const renewableFrom = new Date(subscription.currentPeriodEnd.getTime() - ent.settings.renewalWindowDays * DAY_MS);
  if (plan.id === current.id) {
    const canRenew = ent.now >= renewableFrom;
    return { canPurchase: canRenew, action: canRenew ? 'renew' : 'current', reason: canRenew ? null : 'current_plan', availableAt: canRenew ? null : renewableFrom.toISOString() };
  }
  if (plan.rank > current.rank) return { canPurchase: true, action: 'upgrade', reason: null };
  return { canPurchase: false, action: 'downgrade_unavailable', reason: 'downgrade_after_term', availableAt: subscription.currentPeriodEnd.toISOString() };
}

async function getPlansView(userId) {
  const ent = await resolveEntitlement(userId);
  const settings = ent.settings;
  const taxNote = settings.tax.mode === 'inclusive' ? `Prices include ${settings.tax.label}.` : settings.tax.mode === 'exclusive' ? `Prices exclude ${settings.tax.label}, which is added at checkout.` : 'No tax is charged.';
  return {
    currency: settings.currency,
    intervals: INTERVALS.map((id) => ({ id, months: MONTHS[id] })),
    taxNote,
    platformFeeMinor: settings.platformFeeMinor,
    yearlyTerms: 'Yearly plans are charged upfront for the full year. Monthly plans are charged for one month at a time.',
    renewalTerms: 'Plans are prepaid for the term you choose and do not renew automatically. Renew from this page before your term ends to keep your plan.',
    quotaTerms: 'Free allowances reset on the 1st of every month. Paid plans’ generation allowance resets every month from your subscription date, including yearly plans.',
    fairUse: { editsPerHour: settings.fairUseEditsPerHour, text: `Unlimited AI edits are subject to a fair-use limit of ${settings.fairUseEditsPerHour} edits per hour.` },
    currentPlanId: ent.plan.id,
    subscriptionStatus: ent.status,
    plans: Object.values(ent.plans).sort((a, b) => a.rank - b.rank).map((plan) => ({
      ...plan,
      pricing: planPricing(plan, settings),
      eligibility: eligibilityFor(plan, ent),
      isCurrent: plan.id === ent.plan.id,
    })),
  };
}

async function getSubscriptionView(userId) {
  const ent = await resolveEntitlement(userId);
  const sub = ent.subscription;
  const paid = ['active', 'cancelling', 'grace'].includes(ent.status);
  const graceEndsAt = ent.status === 'grace' ? new Date(sub.currentPeriodEnd.getTime() + ent.settings.graceDays * DAY_MS) : null;
  return {
    plan: { id: ent.plan.id, name: ent.plan.name },
    status: ent.status, // free | active | cancelling | grace | expired
    interval: paid ? sub.interval : null,
    currentPeriodStart: paid ? sub.termStart.toISOString() : null,
    currentPeriodEnd: paid ? sub.currentPeriodEnd.toISOString() : null,
    graceEndsAt: graceEndsAt ? graceEndsAt.toISOString() : null,
    cancelAtPeriodEnd: paid ? Boolean(sub.cancelAtPeriodEnd) : false,
    autoRenew: false,
    canCancel: ent.status === 'active' || ent.status === 'grace',
    canResume: ent.status === 'cancelling',
    renewal: paid ? { availableFrom: new Date(sub.currentPeriodEnd.getTime() - ent.settings.renewalWindowDays * DAY_MS).toISOString() } : null,
    upgradeOptions: entitlements.upgradeOptionsFor(ent),
    downgrade: paid ? { supported: false, availableAt: sub.currentPeriodEnd.toISOString(), note: 'Plans are prepaid. Choose a lower plan when your current term ends.' } : null,
    lapsed: ent.lapsed ? { endedAt: ent.lapsed.endedAt?.toISOString?.() || null, reason: ent.lapsed.reason, planId: ent.lapsed.planId } : null,
  };
}

// ------------------------------------------------------------------ quote / checkout

/** Classify what kind of purchase this is and what it is allowed to be, from authoritative state only. */
function classifyPurchase(ent, plan) {
  const { subscription: sub, status, now } = ent;
  const paidActive = ['active', 'cancelling', 'grace'].includes(status);
  if (!paidActive) return { kind: 'new', creditMinor: 0 };

  const renewableFrom = new Date(sub.currentPeriodEnd.getTime() - ent.settings.renewalWindowDays * DAY_MS);
  if (plan.id === sub.planId) {
    if (now < renewableFrom) {
      throw new BillingError('ALREADY_SUBSCRIBED', 'You already have this plan. You can renew it closer to the end of your term.', { availableAt: renewableFrom.toISOString(), planId: plan.id });
    }
    return { kind: 'renewal', creditMinor: 0 };
  }
  const current = ent.plans[sub.planId];
  if (plan.rank < current.rank) {
    throw new BillingError('PLAN_DOWNGRADE_NOT_ALLOWED', 'Plans are prepaid, so you can switch to a lower plan once your current term ends.', { availableAt: sub.currentPeriodEnd.toISOString() });
  }
  // Upgrade: credit the unused part of what was actually paid for the current term (integer math, floored).
  const remainingMs = Math.max(0, sub.currentPeriodEnd.getTime() - now.getTime());
  const creditMinor = sub.lastTermMs > 0 ? Math.floor((sub.lastPaidMinor * Math.min(remainingMs, sub.lastTermMs)) / sub.lastTermMs) : 0;
  return { kind: 'upgrade', creditMinor };
}

async function buildQuote({ userId, planId, interval, couponCode }) {
  const plan = getPlan(String(planId || ''));
  if (!plan || !plan.available || !plan.purchasable) throw new BillingError('PLAN_NOT_AVAILABLE', 'That plan isn’t available.');
  if (!INTERVALS.includes(interval)) throw new BillingError('INVALID_BILLING_INTERVAL', 'Choose monthly or yearly billing.');

  const ent = await resolveEntitlement(userId);
  const { kind, creditMinor } = classifyPurchase(ent, plan);
  const coupon = couponCode ? await couponService.resolveCoupon({ code: couponCode, userId, planId: plan.id, interval }) : null;
  const quote = computeQuote({ plan, interval, coupon, creditMinor, settings: ent.settings });
  return { quote: { ...quote, kind, planName: plan.name, renewalTerms: interval === 'yearly' ? 'Charged upfront for the full year. Does not renew automatically.' : 'Charged for one month. Does not renew automatically.' }, coupon, plan, ent };
}

const quoteKeyOf = ({ userId, planId, interval, kind, couponId, totalMinor }) =>
  crypto.createHash('sha256').update([userId, planId, interval, kind, couponId || '-', totalMinor].join('|')).digest('hex');

/** Compute the term this order would grant, from authoritative subscription state. */
function termFor(order, sub, now) {
  const months = MONTHS[order.interval];
  const sameActive = sub && sub.status === 'active' && sub.planId === order.planId && now < sub.currentPeriodEnd;
  const start = sameActive ? sub.currentPeriodEnd : now;
  return { start, end: addMonths(start, months), keepAnchor: Boolean(sameActive) };
}

async function expireStaleOrders(userId, now = new Date()) {
  const stale = await BillingOrder.find({ userId, status: 'created', holdExpiresAt: { $lte: now } });
  for (const order of stale || []) {
    const moved = await BillingOrder.findOneAndUpdate({ _id: order._id, status: 'created' }, { $set: { status: 'expired' } });
    if (moved) await couponService.releaseRedemption(order._id);
  }
}

async function createCheckout({ userId, planId, interval, couponCode }) {
  const now = new Date();
  await expireStaleOrders(userId, now);
  const { quote, coupon, plan, ent } = await buildQuote({ userId, planId, interval, couponCode });
  const key = quoteKeyOf({ userId, planId: plan.id, interval, kind: quote.kind, couponId: coupon?.id, totalMinor: quote.totalMinor });

  // Duplicate-checkout protection: an identical, still-open checkout is returned instead of creating another.
  const open = await BillingOrder.findOne({ userId, quoteKey: key, status: 'created', holdExpiresAt: { $gt: now } });
  if (open) return checkoutResponse(open, quote, { reused: true });

  // A different checkout supersedes the user's other open ones (so two live orders can't both be paid).
  const others = await BillingOrder.find({ userId, status: 'created' });
  for (const o of others || []) {
    const moved = await BillingOrder.findOneAndUpdate({ _id: o._id, status: 'created' }, { $set: { status: 'cancelled' } });
    if (moved) await couponService.releaseRedemption(o._id);
  }

  const order = await BillingOrder.create({
    userId, planId: plan.id, interval, kind: quote.kind, currency: quote.currency, quote, amountMinor: quote.totalMinor,
    quoteKey: key, couponId: coupon?.id || null, couponCode: coupon?.code || null,
    holdExpiresAt: new Date(now.getTime() + ent.settings.checkoutHoldMinutes * 60 * 1000),
  });

  try {
    if (coupon) await couponService.reserveRedemption({ coupon, userId, orderId: order._id, discountMinor: quote.couponDiscountMinor });

    if (!quote.requiresPayment) { // fully covered by coupon/credit: nothing to charge, nothing to fake
      const result = await finalizePaidOrder(order._id, { paymentId: null, amountMinor: 0, currency: quote.currency, source: 'no_payment_required' });
      return { ...checkoutResponse(result.order, quote), status: 'paid', subscription: await getSubscriptionView(userId) };
    }

    let rzOrder;
    try {
      rzOrder = await razorpay.createOrderMinor(`bo_${order._id}`, quote.totalMinor, quote.currency, { type: 'subscription', billingOrderId: String(order._id), userId: String(userId), planId: plan.id, interval });
    } catch (error) {
      throw new BillingError('PAYMENT_PROVIDER_UNAVAILABLE', 'We couldn’t start the payment right now. Please try again in a moment.');
    }
    order.razorpayOrderId = rzOrder.id;
    await order.save();
    return checkoutResponse(order, quote);
  } catch (error) {
    await BillingOrder.updateOne({ _id: order._id, status: 'created' }, { $set: { status: 'failed', failureReason: error.code || 'checkout_error' } });
    await couponService.releaseRedemption(order._id);
    throw error;
  }
}

function checkoutResponse(order, quote, extra = {}) {
  return {
    orderId: String(order._id),
    status: order.status,
    quote: order.quote || quote,
    razorpay: order.razorpayOrderId ? { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.razorpayOrderId, amount: order.amountMinor, currency: order.currency } : null,
    holdExpiresAt: order.holdExpiresAt ? order.holdExpiresAt.toISOString() : null,
    ...extra,
  };
}

// ------------------------------------------------------------------ payment confirmation

/**
 * The ONLY place entitlement is granted for a payment. Safe to call any number of times, from the webhook,
 * the verify endpoint and the status poller, concurrently:
 *   1. amount/currency are checked against OUR snapshot (never the client's),
 *   2. the order is claimed with a single conditional update (created|failed -> paid),
 *   3. the term is stored on the order, so a crash mid-way is repaired by the next call (recovery),
 *   4. the subscription write is guarded by lastOrderId, so it applies at most once.
 */
async function finalizePaidOrder(orderId, { paymentId, amountMinor, currency, source }) {
  let order = await BillingOrder.findById(orderId);
  if (!order) throw new BillingError('CHECKOUT_NOT_FOUND', 'Checkout not found.');
  if (order.amountMinor !== amountMinor || order.currency !== currency) {
    await BillingOrder.updateOne({ _id: order._id, status: { $ne: 'paid' } }, { $set: { status: 'failed', failureReason: 'amount_mismatch' } });
    console.error('[billing] amount mismatch, entitlement NOT granted', { orderId: String(order._id), expected: order.amountMinor, got: amountMinor });
    throw new BillingError('PAYMENT_VERIFICATION_FAILED', 'We couldn’t verify this payment.');
  }

  const now = new Date();
  const claimed = await BillingOrder.findOneAndUpdate(
    { _id: order._id, status: { $in: ['created', 'failed', 'expired', 'cancelled'] } },
    { $set: { status: 'paid', paidAt: now, ...(paymentId ? { razorpayPaymentId: paymentId } : {}), failureReason: null } },
    { new: true }
  );
  order = claimed || (await BillingOrder.findById(order._id));
  if (order.status !== 'paid') throw new BillingError('PAYMENT_VERIFICATION_FAILED', 'We couldn’t verify this payment.');
  if (order.appliedAt) return { order, duplicate: true };

  // Phase 2: fix the term on the order once, then apply it.
  if (!order.periodStart) {
    const sub = await Subscription.findOne({ userId: order.userId });
    const term = termFor(order, sub, now);
    await BillingOrder.updateOne({ _id: order._id, periodStart: null }, { $set: { periodStart: term.start, periodEnd: term.end } });
    order = await BillingOrder.findById(order._id);
  }
  await applyOrderToSubscription(order);
  await couponService.redeemRedemption(order._id);
  order = await BillingOrder.findOneAndUpdate({ _id: order._id, appliedAt: null }, { $set: { appliedAt: new Date() } }, { new: true }) || (await BillingOrder.findById(order._id));
  return { order, duplicate: !claimed, source };
}

async function applyOrderToSubscription(order) {
  const sub = await Subscription.findOne({ userId: order.userId });
  if (sub && String(sub.lastOrderId) === String(order._id)) return; // already applied (idempotent)

  const plans = getPlans();
  const now = new Date();
  const activeHigher = sub && sub.status === 'active' && now < sub.currentPeriodEnd && plans[sub.planId].rank > plans[order.planId].rank;
  if (activeHigher) { // a late payment for a plan below the one already held: never downgrade silently
    await BillingOrder.updateOne({ _id: order._id }, { $set: { failureReason: 'superseded_by_higher_plan' } });
    console.error('[billing] paid order superseded by higher plan; needs manual refund', { orderId: String(order._id) });
    return;
  }

  const sameActive = sub && sub.status === 'active' && sub.planId === order.planId && now < sub.currentPeriodEnd;
  const set = {
    planId: order.planId, interval: order.interval, status: 'active', endReason: null,
    termStart: order.periodStart, currentPeriodEnd: order.periodEnd,
    cancelAtPeriodEnd: false, cancelledAt: null, lastOrderId: order._id,
    lastPaidMinor: order.quote?.netBeforeTaxMinor ?? order.amountMinor,
    lastTermMs: order.periodEnd.getTime() - order.periodStart.getTime(),
  };
  if (!sameActive) set.quotaAnchor = order.periodStart; // new plan / new activation => fresh quota window; renewals keep the anchor
  else if (sub && sub.interval !== order.interval) set.interval = order.interval;

  try {
    await Subscription.findOneAndUpdate({ userId: order.userId, lastOrderId: { $ne: order._id } }, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    if (error?.code !== 11000) throw error; // E11000 => another writer already applied this order
  }
}

/** Server-side confirmation for the post-checkout callback: signature AND provider-side payment lookup. */
async function verifyCheckoutPayment({ userId, orderId, razorpayPaymentId, razorpaySignature }) {
  const order = await BillingOrder.findOne({ _id: orderId, userId });
  if (!order || !order.razorpayOrderId) throw new BillingError('CHECKOUT_NOT_FOUND', 'Checkout not found.');
  if (order.status === 'paid' && order.appliedAt) return { status: 'paid', order };

  if (!razorpay.verifyPaymentSignature(order.razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    throw new BillingError('PAYMENT_VERIFICATION_FAILED', 'We couldn’t verify this payment.');
  }
  const payment = await razorpay.fetchPayment(razorpayPaymentId);
  if (!payment || payment.order_id !== order.razorpayOrderId) throw new BillingError('PAYMENT_VERIFICATION_FAILED', 'We couldn’t verify this payment.');
  return settleFromProviderPayment(order, payment, 'verify');
}

async function settleFromProviderPayment(order, payment, source) {
  if (payment.status === 'captured') {
    const result = await finalizePaidOrder(order._id, { paymentId: payment.id, amountMinor: payment.amount, currency: String(payment.currency || '').toUpperCase(), source });
    return { status: 'paid', order: result.order };
  }
  if (payment.status === 'failed') {
    await markFailed(order._id, payment.error_description || 'payment_failed');
    return { status: 'failed', order: await BillingOrder.findById(order._id) };
  }
  return { status: 'pending', order }; // authorized / created: wait for the webhook, never grant on a callback
}

async function markFailed(orderId, reason) {
  const moved = await BillingOrder.findOneAndUpdate({ _id: orderId, status: 'created' }, { $set: { status: 'failed', failureReason: String(reason).slice(0, 200) } }, { new: true });
  if (moved) await couponService.releaseRedemption(orderId); // a retried payment on the same order re-takes it on success
  return Boolean(moved);
}

/** Poll target: also reconciles with the provider so a delayed webhook never strands a paid user. */
async function getCheckoutStatus({ userId, orderId }) {
  const order = await BillingOrder.findOne({ _id: orderId, userId });
  if (!order) throw new BillingError('CHECKOUT_NOT_FOUND', 'Checkout not found.');
  if (order.status === 'paid' && !order.appliedAt) { // crash recovery
    const r = await finalizePaidOrder(order._id, { paymentId: order.razorpayPaymentId, amountMinor: order.amountMinor, currency: order.currency, source: 'recovery' });
    return { status: 'paid', order: r.order };
  }
  if ((order.status === 'created' || order.status === 'failed') && order.razorpayOrderId) {
    try {
      const payments = await razorpay.fetchOrderPayments(order.razorpayOrderId);
      const captured = payments.find((p) => p.status === 'captured');
      if (captured) return settleFromProviderPayment(order, captured, 'poll');
    } catch { /* provider hiccup: report current local state */ }
  }
  return { status: order.status === 'created' ? 'pending' : order.status, order };
}

// ------------------------------------------------------------------ webhook

async function handleWebhookEvent({ eventId, event }) {
  const type = event?.event;
  const payment = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;
  const rzOrderId = payment?.order_id || orderEntity?.id;
  if (!rzOrderId) return { handled: false, reason: 'no_order' };

  const order = await BillingOrder.findOne({ razorpayOrderId: rzOrderId });
  if (!order) return { handled: false, reason: 'not_billing_order' }; // e.g. a marketplace order sharing the account

  if (eventId) { // best-effort duplicate-delivery short circuit; correctness never depends on it
    const first = await BillingOrder.findOneAndUpdate({ _id: order._id, processedEventIds: { $ne: eventId } }, { $addToSet: { processedEventIds: eventId } });
    if (!first) return { handled: true, duplicate: true };
  }

  if (type === 'payment.captured' || type === 'order.paid') {
    const p = payment || (await razorpay.fetchOrderPayments(rzOrderId)).find((x) => x.status === 'captured');
    if (!p) return { handled: true, ignored: true };
    await finalizePaidOrder(order._id, { paymentId: p.id, amountMinor: p.amount, currency: String(p.currency || '').toUpperCase(), source: 'webhook' });
    return { handled: true };
  }
  if (type === 'payment.failed') {
    if (order.status !== 'paid') await markFailed(order._id, payment?.error_description || 'payment_failed');
    return { handled: true };
  }
  return { handled: false, reason: 'ignored_event' };
}

// ------------------------------------------------------------------ management

async function cancelSubscription(userId) {
  const ent = await resolveEntitlement(userId);
  if (!['active', 'grace', 'cancelling'].includes(ent.status)) throw new BillingError('NO_ACTIVE_SUBSCRIPTION', 'You don’t have an active subscription.');
  await Subscription.updateOne({ userId, status: 'active' }, { $set: { cancelAtPeriodEnd: true, cancelledAt: ent.subscription.cancelledAt || new Date() } });
  return getSubscriptionView(userId);
}

async function resumeSubscription(userId) {
  const ent = await resolveEntitlement(userId);
  if (ent.status !== 'cancelling') throw new BillingError('NO_ACTIVE_SUBSCRIPTION', 'There’s no scheduled cancellation to undo.');
  await Subscription.updateOne({ userId, status: 'active' }, { $set: { cancelAtPeriodEnd: false, cancelledAt: null } });
  return getSubscriptionView(userId);
}

async function listOrders(userId, { limit = 20 } = {}) {
  const rows = await BillingOrder.find({ userId, status: { $in: ['paid', 'failed', 'cancelled', 'expired'] } }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 20, 50)).lean();
  return rows.map((o) => ({
    id: String(o._id), createdAt: o.createdAt, paidAt: o.paidAt, status: o.status, planId: o.planId, planName: getPlans()[o.planId]?.name || o.planId,
    interval: o.interval, kind: o.kind, currency: o.currency, amountMinor: o.amountMinor, couponCode: o.couponCode || null,
    periodStart: o.periodStart, periodEnd: o.periodEnd, paymentReference: o.razorpayPaymentId || null,
    breakdown: o.quote ? {
      listPriceMinor: o.quote.listPriceMinor, annualDiscountMinor: o.quote.annualDiscountMinor, couponDiscountMinor: o.quote.couponDiscountMinor,
      creditAppliedMinor: o.quote.creditAppliedMinor, taxMinor: o.quote.tax?.amountMinor, taxInclusive: o.quote.tax?.inclusive,
    } : null,
  }));
}

module.exports = {
  getPlansView, getSubscriptionView, buildQuote, createCheckout, verifyCheckoutPayment, getCheckoutStatus, handleWebhookEvent,
  finalizePaidOrder, cancelSubscription, resumeSubscription, listOrders, expireStaleOrders, termFor,
};
