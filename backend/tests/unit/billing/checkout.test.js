const fakes = require('../../helpers/billingFakes');
jest.mock('../../../src/modules/billing/models', () => { const f = require('../../helpers/billingFakes'); return { Subscription: f.Subscription, BillingOrder: f.BillingOrder, UsageCounter: f.UsageCounter, GenerationLedger: f.GenerationLedger, CouponRedemption: f.CouponRedemption }; });
jest.mock('../../../src/modules/coupons/coupon.model', () => require('../../helpers/billingFakes').Coupon);
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('../infrastructure/mockQueueJob'));
const mockRz = { createOrderMinor: jest.fn(), fetchPayment: jest.fn(), fetchOrderPayments: jest.fn(), verifyPaymentSignature: jest.fn(), verifyWebhookSignature: jest.fn() };
jest.mock('../../../src/services/razorpay.service', () => mockRz);

const billing = require('../../../src/modules/billing/billing.service');
const controller = require('../../../src/modules/billing/billing.controller');
const ent = require('../../../src/modules/billing/entitlement.service');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

const U = 'user-1';
const T0 = new Date('2026-11-01T10:00:00Z');
const code = async (p) => { try { await p; return null; } catch (e) { return e.code || `other:${e.message}`; } };
const addCoupon = (o = {}) => fakes.Coupon.__rows.push({ _id: `c-${o.code}`, code: 'SAVE10', usageMode: 'reusable', discountType: 'percent', discountValue: 10, active: true, appliesTo: ['subscription'], redemptionCount: 0, ...o });
const seedSub = (o = {}) => fakes.Subscription.__rows.push({ _id: 'sub1', userId: U, planId: 'pro', interval: 'monthly', status: 'active', termStart: T0, currentPeriodEnd: new Date('2026-12-01T10:00:00Z'), quotaAnchor: T0, cancelAtPeriodEnd: false, lastPaidMinor: 79900, lastTermMs: 30 * 86400000, createdAt: T0, updatedAt: T0, ...o });
const checkout = (o = {}) => billing.createCheckout({ userId: U, planId: 'pro', interval: 'monthly', ...o });
const captured = (order, over = {}) => ({ id: 'pay_1', order_id: order.razorpay.orderId, status: 'captured', amount: order.razorpay.amount, currency: 'INR', ...over });
let rzSeq = 0;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(T0);
  fakes.reset(); jest.clearAllMocks(); rzSeq = 0;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'; process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec';
  mockRz.createOrderMinor.mockImplementation(async () => ({ id: `order_${++rzSeq}` }));
  mockRz.verifyPaymentSignature.mockReturnValue(true);
  mockRz.verifyWebhookSignature.mockReturnValue(true);
  mockRz.fetchOrderPayments.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe('catalogue API (backend-driven)', () => {
  it('returns plans, pricing, quotas, terms and per-user eligibility from the backend', async () => {
    const v = await billing.getPlansView(U);
    expect(v.currency).toBe('INR');
    expect(v.plans.map((p) => p.id)).toEqual(['free', 'pro', 'plus']);
    const pro = v.plans[1];
    expect(pro.pricing.yearly).toMatchObject({ listPriceMinor: 958800, totalMinor: 910860, annualDiscountMinor: 47940, annualDiscountBps: 500, chargedUpfront: true });
    expect(pro.pricing.monthly.totalMinor).toBe(79900);
    expect(v.plans[2].pricing.yearly.totalMinor).toBe(1402920);
    expect(v.plans[0].pricing).toBeNull();
    expect(v.yearlyTerms).toMatch(/upfront for the full year/);
    expect(v.platformFeeMinor).toBe(0);
    expect(v.plans[1].eligibility).toMatchObject({ canPurchase: true, action: 'subscribe' });
    expect(v.plans[0].isCurrent).toBe(true);
  });
  it('current plan, upgrade and downgrade eligibility for an active Pro user', async () => {
    seedSub();
    const v = await billing.getPlansView(U);
    expect(v.plans[1].eligibility).toMatchObject({ canPurchase: false, action: 'current' });
    expect(v.plans[2].eligibility).toMatchObject({ canPurchase: true, action: 'upgrade' });
  });
});

describe('checkout creation', () => {
  it('creates a server-priced order; the client only supplies plan, interval and code', async () => {
    const r = await checkout({ interval: 'yearly' });
    expect(r.quote.totalMinor).toBe(910860);
    expect(r.razorpay).toMatchObject({ keyId: 'rzp_test_key', amount: 910860, currency: 'INR' });
    expect(mockRz.createOrderMinor).toHaveBeenCalledWith(expect.stringMatching(/^bo_/), 910860, 'INR', expect.objectContaining({ type: 'subscription' }));
    expect(fakes.Subscription.__rows).toHaveLength(0); // no entitlement before payment
  });
  it('controller ignores client-supplied prices/amounts', async () => {
    const res = mockRes();
    await controller.checkout(mockReq({ userId: U, body: { planId: 'pro', interval: 'monthly', amount: 1, amountMinor: 1, price: 1, totalMinor: 1, discount: 99 } }), res);
    expect(res.json.mock.calls[0][0].data.quote.totalMinor).toBe(79900);
  });
  it('unknown / free / unavailable plans and bad intervals are refused', async () => {
    expect(await code(checkout({ planId: 'free' }))).toBe('PLAN_NOT_AVAILABLE');
    expect(await code(checkout({ planId: 'enterprise' }))).toBe('PLAN_NOT_AVAILABLE');
    expect(await code(checkout({ interval: 'weekly' }))).toBe('INVALID_BILLING_INTERVAL');
    expect(mockRz.createOrderMinor).not.toHaveBeenCalled();
  });
  it('a double-click returns the same open order instead of creating a second one', async () => {
    const a = await checkout(); const b = await checkout();
    expect(b.orderId).toBe(a.orderId);
    expect(b.reused).toBe(true);
    expect(mockRz.createOrderMinor).toHaveBeenCalledTimes(1);
  });
  it('a different checkout supersedes the user’s other open order', async () => {
    const a = await checkout(); await checkout({ planId: 'plus' });
    expect(fakes.BillingOrder.__rows.find((o) => String(o._id) === a.orderId).status).toBe('cancelled');
  });
  it('provider outage fails cleanly and releases any coupon hold', async () => {
    addCoupon();
    mockRz.createOrderMinor.mockRejectedValueOnce(new Error('down'));
    expect(await code(checkout({ couponCode: 'save10' }))).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(0);
    expect(fakes.BillingOrder.__rows[0].status).toBe('failed');
  });
});

describe('subscription state rules', () => {
  it('cannot buy the plan you already hold mid-term (no double charge)', async () => {
    seedSub();
    expect(await code(checkout())).toBe('ALREADY_SUBSCRIBED');
    expect(mockRz.createOrderMinor).not.toHaveBeenCalled();
  });
  it('can renew inside the renewal window; the new term extends from the current end', async () => {
    seedSub({ currentPeriodEnd: new Date('2026-11-05T10:00:00Z') });
    const r = await checkout();
    expect(r.quote.kind).toBe('renewal');
    await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' }).catch(() => {});
    mockRz.fetchPayment.mockResolvedValue(captured(r));
    await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
    const sub = fakes.Subscription.__rows[0];
    expect(sub.currentPeriodEnd.toISOString()).toBe('2026-12-05T10:00:00.000Z');
    expect(sub.quotaAnchor.toISOString()).toBe(T0.toISOString()); // renewals keep the quota anchor
  });
  it('downgrades mid-term are refused with the date they become possible', async () => {
    seedSub({ planId: 'plus' });
    try { await checkout({ planId: 'pro' }); throw new Error('no'); } catch (e) {
      expect(e.code).toBe('PLAN_DOWNGRADE_NOT_ALLOWED');
      expect(e.details.availableAt).toBe('2026-12-01T10:00:00.000Z');
    }
  });
  it('upgrade credits unused time (integer, floored) and starts a fresh term + quota window', async () => {
    jest.setSystemTime(new Date('2026-11-16T10:00:00Z')); // halfway through a 30-day term
    seedSub({ currentPeriodEnd: new Date('2026-12-01T10:00:00Z'), lastPaidMinor: 79900, lastTermMs: 30 * 86400000 });
    const r = await checkout({ planId: 'plus' });
    expect(r.quote.kind).toBe('upgrade');
    expect(r.quote.creditAppliedMinor).toBe(Math.floor(79900 * (15 * 86400000) / (30 * 86400000)));
    expect(r.quote.totalMinor).toBe(129900 - r.quote.creditAppliedMinor);
    mockRz.fetchPayment.mockResolvedValue(captured(r));
    await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
    const sub = fakes.Subscription.__rows[0];
    expect(sub.planId).toBe('plus');
    expect(sub.quotaAnchor.toISOString()).toBe('2026-11-16T10:00:00.000Z');
    expect(fakes.Subscription.__rows).toHaveLength(1); // never a second subscription
  });
});

describe('payment confirmation', () => {
  it('verify grants the plan only after signature AND provider-side payment lookup', async () => {
    const r = await checkout();
    mockRz.fetchPayment.mockResolvedValue(captured(r));
    const out = await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' });
    expect(out.status).toBe('paid');
    expect(mockRz.verifyPaymentSignature).toHaveBeenCalledWith('order_1', 'pay_1', 'sig');
    expect(mockRz.fetchPayment).toHaveBeenCalledWith('pay_1');
    expect(fakes.Subscription.__rows[0]).toMatchObject({ planId: 'pro', status: 'active', lastOrderId: expect.anything() });
    expect((await ent.resolveEntitlement(U)).plan.id).toBe('pro');
  });
  it('a bad signature never grants anything', async () => {
    const r = await checkout(); mockRz.verifyPaymentSignature.mockReturnValue(false);
    expect(await code(billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 'forged' }))).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });
  it('a valid signature but a payment the provider says is NOT captured stays pending (no frontend-only activation)', async () => {
    const r = await checkout(); mockRz.fetchPayment.mockResolvedValue(captured(r, { status: 'authorized' }));
    const out = await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
    expect(out.status).toBe('pending');
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });
  it('a payment belonging to a different order is rejected', async () => {
    const r = await checkout(); mockRz.fetchPayment.mockResolvedValue(captured(r, { order_id: 'order_other' }));
    expect(await code(billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' }))).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });
  it('an amount that differs from our snapshot is not honoured', async () => {
    const r = await checkout(); mockRz.fetchPayment.mockResolvedValue(captured(r, { amount: 100 }));
    expect(await code(billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' }))).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });
  it('another user cannot verify or poll your checkout', async () => {
    const r = await checkout();
    expect(await code(billing.verifyCheckoutPayment({ userId: 'user-2', orderId: r.orderId, razorpayPaymentId: 'p', razorpaySignature: 's' }))).toBe('CHECKOUT_NOT_FOUND');
    expect(await code(billing.getCheckoutStatus({ userId: 'user-2', orderId: r.orderId }))).toBe('CHECKOUT_NOT_FOUND');
  });
  it('a failed payment is recorded, frees the coupon, and the user can pay again on the same order', async () => {
    addCoupon();
    const r = await checkout({ couponCode: 'SAVE10' });
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(1);
    await billing.handleWebhookEvent({ eventId: 'e1', event: { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_x', order_id: r.razorpay.orderId, error_description: 'declined' } } } } });
    const order = fakes.BillingOrder.__rows[0];
    expect(order.status).toBe('failed');
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(0);
    expect(fakes.Subscription.__rows).toHaveLength(0);
    await billing.handleWebhookEvent({ eventId: 'e2', event: { event: 'payment.captured', payload: { payment: { entity: captured(r, { id: 'pay_ok' }) } } } });
    expect(fakes.BillingOrder.__rows[0].status).toBe('paid');
    expect(fakes.Subscription.__rows[0].planId).toBe('pro');
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(1); // re-taken on success
    expect(fakes.CouponRedemption.__rows[0].status).toBe('redeemed');
  });
  it('polling reconciles with the provider when the webhook is late', async () => {
    const r = await checkout(); mockRz.fetchOrderPayments.mockResolvedValue([captured(r)]);
    const s = await billing.getCheckoutStatus({ userId: U, orderId: r.orderId });
    expect(s.status).toBe('paid');
    expect(fakes.Subscription.__rows[0].planId).toBe('pro');
  });
  it('a crash after the order was marked paid but before entitlement was applied is repaired on the next poll', async () => {
    const r = await checkout();
    const o = fakes.BillingOrder.__rows[0]; o.status = 'paid'; o.razorpayPaymentId = 'pay_1'; o.paidAt = new Date(); // applied step never ran
    const s = await billing.getCheckoutStatus({ userId: U, orderId: r.orderId });
    expect(s.status).toBe('paid');
    expect(fakes.Subscription.__rows[0].planId).toBe('pro');
  });
});

describe('webhook idempotency', () => {
  const captureEvent = (r) => ({ event: 'payment.captured', payload: { payment: { entity: captured(r) } } });
  it('the same event delivered 5 times (and concurrently) grants exactly one term', async () => {
    addCoupon({ code: 'ONCE' });
    const r = await checkout({ couponCode: 'ONCE' });
    await Promise.all([1, 2, 3, 4, 5].map((i) => billing.handleWebhookEvent({ eventId: i % 2 ? 'same' : `ev${i}`, event: captureEvent(r) })));
    await billing.handleWebhookEvent({ eventId: 'same', event: captureEvent(r) });
    expect(fakes.Subscription.__rows).toHaveLength(1);
    expect(fakes.Subscription.__rows[0].currentPeriodEnd.toISOString()).toBe('2026-12-01T10:00:00.000Z'); // one month, not five
    expect(fakes.CouponRedemption.__rows).toHaveLength(1);
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(1);
  });
  it('webhook and verify racing each other still apply the order once', async () => {
    const r = await checkout(); mockRz.fetchPayment.mockResolvedValue(captured(r));
    await Promise.all([
      billing.handleWebhookEvent({ eventId: 'w', event: captureEvent(r) }),
      billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' }),
      billing.getCheckoutStatus({ userId: U, orderId: r.orderId }),
    ]);
    expect(fakes.Subscription.__rows).toHaveLength(1);
    expect(fakes.Subscription.__rows[0].currentPeriodEnd.toISOString()).toBe('2026-12-01T10:00:00.000Z');
  });
  it('events for unknown orders (e.g. marketplace purchases) are ignored', async () => {
    const out = await billing.handleWebhookEvent({ eventId: 'x', event: { event: 'payment.captured', payload: { payment: { entity: { id: 'p', order_id: 'order_market', amount: 1, currency: 'INR' } } } } });
    expect(out).toMatchObject({ handled: false });
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });
  it('late payment for a lower plan than one already held never downgrades and is flagged', async () => {
    const r = await checkout();
    seedSub({ planId: 'plus', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') });
    await billing.handleWebhookEvent({ eventId: 'l', event: captureEvent(r) });
    expect(fakes.Subscription.__rows[0].planId).toBe('plus');
    expect(fakes.BillingOrder.__rows[0].failureReason).toBe('superseded_by_higher_plan');
  });
});

describe('webhook endpoint security', () => {
  const hit = async (headers, body = '{"event":"payment.captured"}') => { const res = mockRes(); await controller.webhook({ headers, body: Buffer.from(body) }, res); return res; };
  it('rejects a missing or invalid signature (signature is mandatory)', async () => {
    expect((await hit({})).status).toHaveBeenCalledWith(400);
    mockRz.verifyWebhookSignature.mockReturnValue(false);
    expect((await hit({ 'x-razorpay-signature': 'bad' })).status).toHaveBeenCalledWith(400);
  });
  it('refuses to run unconfigured rather than accept unsigned events', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect((await hit({ 'x-razorpay-signature': 'x' })).status).toHaveBeenCalledWith(503);
  });
  it('accepts a correctly signed event', async () => {
    const res = await hit({ 'x-razorpay-signature': 'ok' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('coupons', () => {
  it('validates and previews the discount; shows how it was calculated', async () => {
    addCoupon({ code: 'WELCOME', discountValue: 20 });
    const { quote } = await billing.buildQuote({ userId: U, planId: 'pro', interval: 'monthly', couponCode: ' welcome ' });
    expect(quote.coupon).toMatchObject({ code: 'WELCOME', discountMinor: 15980 });
    expect(quote.totalMinor).toBe(79900 - 15980);
  });
  it.each([
    ['unknown code', 'NOPE', {}, 'COUPON_INVALID'],
    ['marketplace-only coupon', 'MKT', { appliesTo: ['marketplace'] }, 'COUPON_INVALID'],
    ['legacy coupon without appliesTo', 'OLD', { appliesTo: undefined }, 'COUPON_INVALID'],
    ['inactive coupon', 'OFF', { active: false }, 'COUPON_INACTIVE'],
    ['expired coupon', 'EXP', { expiresAt: new Date('2026-10-01') }, 'COUPON_EXPIRED'],
    ['not yet valid', 'SOON', { startsAt: new Date('2027-01-01') }, 'COUPON_INVALID'],
    ['wrong plan', 'PLUSONLY', { eligiblePlans: ['plus'] }, 'COUPON_NOT_ELIGIBLE'],
    ['wrong interval', 'YEARLY', { eligibleIntervals: ['yearly'] }, 'COUPON_NOT_ELIGIBLE'],
    ['exhausted', 'FULL', { maxRedemptions: 2, redemptionCount: 2 }, 'COUPON_EXHAUSTED'],
    ['single-use already used', 'ONE', { usageMode: 'single_global', redemptionCount: 1 }, 'COUPON_EXHAUSTED'],
    ['below minimum purchase', 'BIG', { minPurchaseMinor: 500000 }, 'COUPON_MIN_PURCHASE_NOT_MET'],
  ])('rejects: %s', async (_n, codeStr, over, expected) => {
    if (_n !== 'unknown code') addCoupon({ code: codeStr, ...over });
    expect(await code(billing.buildQuote({ userId: U, planId: 'pro', interval: 'monthly', couponCode: codeStr }))).toBe(expected);
  });
  it('invalid coupon through the validate endpoint is a structured error, not a crash', async () => {
    const res = mockRes();
    await controller.validateCoupon(mockReq({ userId: U, body: { planId: 'pro', interval: 'monthly', code: 'NOPE' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'COUPON_INVALID' });
  });
  it('stacking: a normal coupon cannot be combined with the yearly discount, and says so', async () => {
    addCoupon({ code: 'NOSTACK' });
    try { await billing.buildQuote({ userId: U, planId: 'pro', interval: 'yearly', couponCode: 'NOSTACK' }); throw new Error('no'); } catch (e) {
      expect(e.code).toBe('COUPON_NOT_STACKABLE');
      expect(e.message).toMatch(/cannot be combined with the yearly/);
    }
  });
  it('stacking when explicitly enabled: both discounts are itemised', async () => {
    addCoupon({ code: 'STACK', stackableWithAnnualDiscount: true });
    const { quote } = await billing.buildQuote({ userId: U, planId: 'plus', interval: 'yearly', couponCode: 'STACK' });
    expect(quote.annualDiscountMinor).toBe(155880);
    expect(quote.couponDiscountMinor).toBe(140292);
    expect(quote.totalMinor).toBe(1402920 - 140292);
  });
  it('global usage limit holds under concurrent checkouts (limit 1, 5 users)', async () => {
    addCoupon({ code: 'LAST', maxRedemptions: 1 });
    const results = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((u) => billing.createCheckout({ userId: u, planId: 'pro', interval: 'monthly', couponCode: 'LAST' }).then(() => 'ok', (e) => e.code)));
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(1);
  });
  it('per-user limit', async () => {
    addCoupon({ code: 'ONEPER', perUserLimit: 1 });
    const r = await checkout({ couponCode: 'ONEPER' });
    mockRz.fetchPayment.mockResolvedValue(captured(r));
    await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
    fakes.Subscription.__rows[0].currentPeriodEnd = new Date('2026-11-02T00:00:00Z'); // renewal window
    expect(await code(checkout({ couponCode: 'ONEPER' }))).toBe('COUPON_USER_LIMIT_REACHED');
  });
  it('first-time-only', async () => {
    addCoupon({ code: 'FIRST', firstTimeOnly: true });
    fakes.BillingOrder.__rows.push({ _id: 'old', userId: U, status: 'paid' });
    expect(await code(billing.buildQuote({ userId: U, planId: 'pro', interval: 'monthly', couponCode: 'FIRST' }))).toBe('COUPON_FIRST_TIME_ONLY');
  });
  it('redemption is tracked: reserved at checkout, redeemed on payment, released when the checkout lapses', async () => {
    addCoupon({ code: 'TRACK' });
    const r = await checkout({ couponCode: 'TRACK' });
    expect(fakes.CouponRedemption.__rows[0]).toMatchObject({ status: 'reserved', discountMinor: 7990 });
    jest.setSystemTime(new Date(T0.getTime() + 31 * 60 * 1000));
    await billing.expireStaleOrders(U);
    expect(fakes.CouponRedemption.__rows[0].status).toBe('released');
    expect(fakes.Coupon.__rows[0].redemptionCount).toBe(0);
    expect(fakes.BillingOrder.__rows.find((o) => String(o._id) === r.orderId).status).toBe('expired');
  });
  it('a 100% coupon needs no payment and creates no provider order (no fake success flow)', async () => {
    addCoupon({ code: 'FREE100', discountValue: 100 });
    const r = await checkout({ couponCode: 'FREE100' });
    expect(r.status).toBe('paid');
    expect(mockRz.createOrderMinor).not.toHaveBeenCalled();
    expect(fakes.Subscription.__rows[0].planId).toBe('pro');
    expect(fakes.CouponRedemption.__rows[0].status).toBe('redeemed');
  });
});

describe('manage subscription', () => {
  it('cancel keeps access until the end; resume undoes it; both are idempotent', async () => {
    seedSub();
    let v = await billing.cancelSubscription(U);
    expect(v).toMatchObject({ status: 'cancelling', cancelAtPeriodEnd: true, canResume: true, autoRenew: false });
    expect((await ent.resolveEntitlement(U)).plan.id).toBe('pro');
    await billing.cancelSubscription(U);
    v = await billing.resumeSubscription(U);
    expect(v).toMatchObject({ status: 'active', cancelAtPeriodEnd: false });
  });
  it('cancel without a subscription is a clean 404-style error', async () => {
    expect(await code(billing.cancelSubscription(U))).toBe('NO_ACTIVE_SUBSCRIPTION');
  });
  it('billing history lists only your orders with itemised amounts', async () => {
    const r = await checkout(); mockRz.fetchPayment.mockResolvedValue(captured(r));
    await billing.verifyCheckoutPayment({ userId: U, orderId: r.orderId, razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
    const mine = await billing.listOrders(U); const theirs = await billing.listOrders('user-2');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: 'paid', amountMinor: 79900, planName: 'Pro', paymentReference: 'pay_1' });
    expect(theirs).toHaveLength(0);
  });
});
