'use strict';

const service = require('./billing.service');
const entitlements = require('./entitlement.service');
const razorpayService = require('../../services/razorpay.service');
const { sendBillingError, BillingError } = require('./errors');

// Every handler reads the user from the verified JWT (req.userId). Nothing about price, plan limits,
// subscription state or discounts is ever accepted from the request body.
const wrap = (fn, fallback) => async (req, res) => {
  try {
    const data = await fn(req);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendBillingError(res, error, fallback);
  }
};

const str = (v, max = 64) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

exports.getPlans = wrap((req) => service.getPlansView(req.userId), 'Could not load plans');
exports.getSubscription = wrap((req) => service.getSubscriptionView(req.userId), 'Could not load subscription');
exports.getUsage = wrap((req) => entitlements.getUsageSummary(req.userId), 'Could not load usage');
exports.getOrders = wrap((req) => service.listOrders(req.userId, { limit: req.query.limit }), 'Could not load billing history');

// Price preview; with a couponCode it is also the coupon validator.
const quote = async (req) => {
  const { quote: q } = await service.buildQuote({ userId: req.userId, planId: str(req.body.planId), interval: str(req.body.interval), couponCode: str(req.body.couponCode || req.body.code) });
  return q;
};
exports.quote = wrap(quote, 'Could not calculate price');
exports.validateCoupon = async (req, res) => {
  try {
    if (!str(req.body.code)) throw new BillingError('COUPON_INVALID', 'Enter a promo code.');
    const q = await quote({ ...req, body: { ...req.body, couponCode: req.body.code } });
    return res.status(200).json({ success: true, data: { valid: true, quote: q, savingsMinor: q.couponDiscountMinor } });
  } catch (error) {
    return sendBillingError(res, error, 'Could not validate coupon');
  }
};

exports.checkout = wrap((req) => service.createCheckout({ userId: req.userId, planId: str(req.body.planId), interval: str(req.body.interval), couponCode: str(req.body.couponCode) }), 'Could not start checkout');

exports.verify = wrap(async (req) => {
  const r = await service.verifyCheckoutPayment({ userId: req.userId, orderId: str(req.body.orderId), razorpayPaymentId: str(req.body.razorpay_payment_id, 100), razorpaySignature: str(req.body.razorpay_signature, 200) });
  return { status: r.status, orderId: String(r.order._id), subscription: r.status === 'paid' ? await service.getSubscriptionView(req.userId) : undefined };
}, 'Could not verify payment');

exports.checkoutStatus = wrap(async (req) => {
  const r = await service.getCheckoutStatus({ userId: req.userId, orderId: str(req.params.orderId) });
  return { status: r.status, orderId: String(r.order._id), failureReason: r.status === 'failed' ? 'Your payment didn’t go through. You haven’t been charged for this plan.' : null, subscription: r.status === 'paid' ? await service.getSubscriptionView(req.userId) : undefined };
}, 'Could not check payment status');

exports.cancel = wrap((req) => service.cancelSubscription(req.userId), 'Could not cancel subscription');
exports.resume = wrap((req) => service.resumeSubscription(req.userId), 'Could not resume subscription');

/**
 * Razorpay -> backend. Strict: the signature header is REQUIRED and checked against the raw body
 * (unlike a handler that tolerates a missing signature). Always 200 for verified-but-irrelevant events so the
 * provider does not retry forever; 5xx for genuine processing errors so it does retry.
 */
exports.webhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: 'Webhook not configured' });
  const signature = req.headers['x-razorpay-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  let valid = false;
  try { valid = Boolean(signature) && razorpayService.verifyWebhookSignature(raw.toString('utf8'), signature); } catch { valid = false; }
  if (!valid) return res.status(400).json({ success: false, message: 'Invalid signature' });

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ success: false, message: 'Invalid payload' }); }
  try {
    const result = await service.handleWebhookEvent({ eventId: req.headers['x-razorpay-event-id'], event });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof BillingError) { // permanent (e.g. amount mismatch): acknowledge, don't retry
      console.error('[billing] webhook rejected:', error.code);
      return res.status(200).json({ success: true, handled: false, reason: error.code });
    }
    console.error('[billing] webhook error:', error.message);
    return res.status(500).json({ success: false });
  }
};
