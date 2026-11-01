const fakes = require('../../helpers/billingFakes');
jest.mock('../../../src/modules/billing/models', () => { const f = require('../../helpers/billingFakes'); return { Subscription: f.Subscription, BillingOrder: f.BillingOrder, UsageCounter: f.UsageCounter, GenerationLedger: f.GenerationLedger, CouponRedemption: f.CouponRedemption }; });
jest.mock('../../../src/modules/coupons/coupon.model', () => require('../../helpers/billingFakes').Coupon);
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('../infrastructure/mockQueueJob'));
jest.mock('../../../src/infrastructure/events', () => require('../../mocks/services/events.mock'));
const mockRz = { createOrderMinor: jest.fn(), fetchPayment: jest.fn(), fetchOrderPayments: jest.fn(), verifyPaymentSignature: jest.fn(), verifyWebhookSignature: jest.fn() };
jest.mock('../../../src/services/razorpay.service', () => mockRz);

const billing = require('../../../src/modules/billing/billing.service');
const events = require('../../../src/infrastructure/events');

const U = 'user-1';
const T0 = new Date('2026-11-01T10:00:00Z');
let rz = 0;
const captured = (order, over = {}) => ({ id: 'pay_1', order_id: order.razorpay.orderId, status: 'captured', amount: order.razorpay.amount, currency: 'INR', ...over });
const webhook = (order, id = 'evt_1') => billing.handleWebhookEvent({ eventId: id, event: { event: 'payment.captured', payload: { payment: { entity: captured(order) } } } });
const verify = (order, payment) => { mockRz.fetchPayment.mockResolvedValue(payment); return billing.verifyCheckoutPayment({ userId: U, orderId: order.orderId, razorpayPaymentId: payment.id, razorpaySignature: 'sig' }); };
const checkout = (o = {}) => billing.createCheckout({ userId: U, planId: 'pro', interval: 'monthly', ...o });
const notified = () => events.notifySubscriptionPaid.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(T0);
  fakes.reset(); jest.clearAllMocks(); rz = 0;
  process.env.RAZORPAY_KEY_ID = 'k';
  mockRz.createOrderMinor.mockImplementation(async () => ({ id: `order_${++rz}` }));
  mockRz.verifyPaymentSignature.mockReturnValue(true);
  mockRz.verifyWebhookSignature.mockReturnValue(true);
  mockRz.fetchOrderPayments.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe('subscription purchase -> admin WhatsApp event', () => {
  it('fires once the payment is verified AND the entitlement is applied', async () => {
    const order = await checkout();
    expect(events.notifySubscriptionPaid).not.toHaveBeenCalled(); // checkout creation / unpaid: nothing
    await verify(order, captured(order));
    expect(notified()).toHaveLength(1);
    expect(notified()[0]).toMatchObject({ status: 'paid', kind: 'new', planId: 'pro', appliedAt: expect.any(Date) });
    expect(fakes.Subscription.__rows[0]).toMatchObject({ planId: 'pro', status: 'active' });
  });

  it('webhook, verify, status poll and a refresh all reference the SAME order id (the producer dedupes on it)', async () => {
    const order = await checkout();
    const pay = captured(order);
    await webhook(order);
    await webhook(order, 'evt_retry_1'); // provider retry with a new event id
    await webhook(order, 'evt_1');       // exact duplicate delivery
    await verify(order, pay);            // user's browser callback
    await verify(order, pay);            // refresh of the checkout page
    mockRz.fetchOrderPayments.mockResolvedValue([pay]);
    await billing.getCheckoutStatus({ userId: U, orderId: order.orderId });
    const ids = new Set(notified().map((o) => String(o._id)));
    expect(ids.size).toBe(1);
    expect(fakes.Subscription.__rows).toHaveLength(1); // and entitlement was granted exactly once
  });

  it('a renewal reaches the producer as kind "renewal" (-> SUBSCRIPTION_RENEWED)', async () => {
    fakes.Subscription.__rows.push({ _id: 'sub1', userId: U, planId: 'pro', interval: 'monthly', status: 'active', termStart: T0, currentPeriodEnd: new Date(T0.getTime() + 3 * 86400000), quotaAnchor: T0, cancelAtPeriodEnd: false, lastPaidMinor: 79900, lastTermMs: 30 * 86400000, createdAt: T0, updatedAt: T0 });
    const order = await checkout();
    await verify(order, captured(order));
    expect(notified()[0]).toMatchObject({ kind: 'renewal', status: 'paid' });
  });

  it('sends nothing for a failed payment', async () => {
    const order = await checkout();
    await billing.handleWebhookEvent({ eventId: 'f1', event: { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_x', order_id: order.razorpay.orderId, error_description: 'declined' } } } } });
    await verify(order, captured(order, { status: 'failed', error_description: 'declined' }));
    expect(events.notifySubscriptionPaid).not.toHaveBeenCalled();
  });

  it('sends nothing for an authorized-but-not-captured payment, or an abandoned checkout', async () => {
    const order = await checkout();
    const r = await verify(order, captured(order, { status: 'authorized' }));
    expect(r.status).toBe('pending');
    expect(events.notifySubscriptionPaid).not.toHaveBeenCalled();
  });

  it('sends nothing when the paid amount does not match the order (entitlement is refused too)', async () => {
    const order = await checkout();
    await expect(verify(order, captured(order, { amount: 100 }))).rejects.toMatchObject({ code: 'PAYMENT_VERIFICATION_FAILED' });
    expect(events.notifySubscriptionPaid).not.toHaveBeenCalled();
    expect(fakes.Subscription.__rows).toHaveLength(0);
  });

  it('a notification failure can never break the payment or the entitlement', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    events.notifySubscriptionPaid.mockRejectedValueOnce(new Error('queue exploded'));
    const order = await checkout();
    const r = await verify(order, captured(order));
    expect(r.status).toBe('paid');
    expect(fakes.Subscription.__rows[0].status).toBe('active');
    err.mockRestore();
  });
});
