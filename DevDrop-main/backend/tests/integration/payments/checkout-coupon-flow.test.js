// INTEGRATION: Checkout → Coupon reservation → Payment verification → Purchase
// → Payout, exercising the real cross-module business logic in
// payment.controller.js together with the real pricing helpers, the real
// auth/verifyEmail middleware chain, and the real razorpay.service.js
// (only the third-party `razorpay` SDK itself is mocked — signature
// verification below runs through real HMAC crypto).
//
// Why this exists: tests/api/coupons/* only covers the admin CRUD endpoints
// (create/list/toggle). Nothing in the existing suite exercises the coupon
// *consumption* path — reservation, concurrent-checkout races, and final
// consumption — even though that logic lives entirely in payment.controller.js
// and touches five models. This suite fills that gap and is the reason a
// dedicated Coupon mock with atomic findOneAndUpdate semantics was added.
//
// Database strategy: a real MongoDB (via mongodb-memory-server) could not be
// used in this sandbox — its setup step downloads a mongod binary from
// fastdl.mongodb.org, which this environment's network egress rejects with a
// 403 regardless of requested version (verified against 8.2.6 and 6.0.14
// before writing this file). Per the task's Option D, we fall back to an
// in-memory database boundary mock — but a purpose-built one for this suite
// (Coupon/Payment/Purchase/Payout/BankDetails), not the disguised-unit-test
// pattern of mocking each controller function directly. All of the business
// logic under test (coupon math, reservation windows, race handling, payout
// creation) is the real production code from payment.controller.js.

jest.mock('../../../src/modules/website/website.model', () => require('../../mocks/models/website.model.mock'));
jest.mock('../../../src/modules/payment/purchase.model', () => require('../../mocks/models/purchase.model.mock'));
jest.mock('../../../src/modules/payment/payment.model', () => require('../../mocks/models/payment.model.mock'));
jest.mock('../../../src/modules/payout/payout.model', () => require('../../mocks/models/payout.model.mock'));
jest.mock('../../../src/modules/coupons/coupon.model', () => require('../../mocks/models/coupon.model.mock'));
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/modules/user/bankDetails.model', () => require('../../mocks/models/bankDetails.model.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));

// Only the third-party SDK is mocked — razorpay.service.js's own logic
// (order-amount clamping, signature HMACs) all runs for real.
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: { create: jest.fn(), fetch: jest.fn() },
    payments: { fetch: jest.fn() },
  }));
});

jest.mock('../../../src/shared/middleware/rateLimit', () => ({
  generalLimiter: (req, res, next) => next(),
  paymentLimiter: (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const Razorpay = require('razorpay');

const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const Payment = require('../../../src/modules/payment/payment.model');
const Payout = require('../../../src/modules/payout/payout.model');
const Coupon = require('../../../src/modules/coupons/coupon.model');
const User = require('../../../src/modules/user/user.model');
const emailService = require('../../../src/services/email.service');
const paymentRoutes = require('../../../src/modules/payment/payment.routes');
const { generateAccessToken } = require('../../../src/shared/utils/jwt');

const buildApp = () => {
  const app = express();
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/payment/webhook') return express.raw({ type: 'application/json' })(req, res, next);
    next();
  });
  app.use(express.json());
  app.use('/api/payment', paymentRoutes);
  return app;
};

let app;
let buyer;
let seller;
let website;

// razorpay.service.js lazily constructs ONE Razorpay instance and caches it
// for the lifetime of the module, so the mocked constructor must always
// return the same object — otherwise a later test's mockImplementation
// change would never be seen by the already-cached instance.
const razorpayInstance = {
  orders: { create: jest.fn(), fetch: jest.fn() },
  payments: { fetch: jest.fn() },
};
Razorpay.mockImplementation(() => razorpayInstance);

let orderCounter = 0;

beforeEach(async () => {
  orderCounter += 1;
  razorpayInstance.orders.create.mockReset().mockImplementation(async (opts) => ({
    id: `order_test_${orderCounter}`,
    amount: opts.amount,
    currency: opts.currency,
  }));
  razorpayInstance.payments.fetch.mockReset();

  User.__reset();
  Website.__reset();
  Purchase.__reset();
  Payment.__reset();
  Payout.__reset();
  Coupon.__reset();

  process.env.RAZORPAY_KEY_ID = 'test_key_id';
  process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';

  app = buildApp();

  buyer = await User.__seed({ name: 'Buyer One', email: 'buyer@example.com', password: 'password123', isVerified: true });
  seller = await User.__seed({ name: 'Seller One', email: 'seller@example.com', password: 'password123', isVerified: true });

  website = Website.__seed({
    _id: 'website-1',
    name: 'cool-saas.com',
    category: 'paid',
    price: 10000,
    status: 'approved',
    sellerId: { _id: seller._id, email: seller.email }, // pre-"populated" — see website.model.mock's populate() no-op
  });
});

const authHeaderFor = (user) => `Bearer ${generateAccessToken(user._id)}`;

describe('Checkout coupon reservation → payment verification → purchase/payout (integration)', () => {
  it('walks a single_global coupon through quote → reserve → verify → consume, creating a real Purchase and Payout', async () => {
    await Coupon.create({ code: 'LAUNCH50', usageMode: 'single_global', discountType: 'percent', discountValue: 50, active: true });

    // Step 1: quote — read-only, must not reserve anything yet.
    const quoteRes = await request(app)
      .post('/api/payment/quote')
      .set('Authorization', authHeaderFor(buyer))
      .send({ websiteId: website._id, couponCode: 'launch50' }); // lowercase on purpose — controller normalizes

    expect(quoteRes.status).toBe(200);
    expect(quoteRes.body.data.coupon.discountAmount).toBeGreaterThan(0);
    expect(Coupon.__all()[0].reservedByPaymentId).toBeNull();

    // Step 2: create-order — this is where the real reservation happens,
    // atomically, via Coupon.findOneAndUpdate in payment.controller.js.
    const orderRes = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', authHeaderFor(buyer))
      .send({ websiteId: website._id, couponCode: 'LAUNCH50' });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.data.mode).toBe('razorpay');
    const reservedCoupon = Coupon.__all()[0];
    expect(String(reservedCoupon.reservedByUserId)).toBe(String(buyer._id));
    expect(reservedCoupon.usageCount).toBe(0); // reserved, not yet consumed

    const [paymentRecord] = require('../../mocks/models/payment.model.mock').__all();
    expect(paymentRecord.status).toBe('created');
    expect(paymentRecord.couponCode).toBe('LAUNCH50');

    // Step 3: verify — mock the Razorpay SDK boundary, run everything else for real.
    razorpayInstance.payments.fetch.mockResolvedValue({ id: 'pay_test123', status: 'captured' });

    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${paymentRecord.razorpayOrderId}|pay_test123`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/payment/verify')
      .set('Authorization', authHeaderFor(buyer))
      .send({
        razorpayOrderId: paymentRecord.razorpayOrderId,
        razorpayPaymentId: 'pay_test123',
        razorpaySignature: signature,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.coupon.code).toBe('LAUNCH50');

    // Cross-module assertions: the coupon is now consumed (Coupon module),
    // a Purchase exists linking buyer+website (Payment module), and a
    // pending Payout was created for the seller (Payout module) — all from
    // one verifyPayment call.
    const finalCoupon = Coupon.__all()[0];
    expect(finalCoupon.usageCount).toBe(1);
    expect(finalCoupon.consumedByPaymentId).toBeTruthy();

    const purchases = Purchase.__all();
    expect(purchases).toHaveLength(1);
    expect(purchases[0].discountAmount).toBeGreaterThan(0);

    const payouts = Payout.__all();
    expect(payouts).toHaveLength(1);
    expect(payouts[0].status).toBe('pending');
    // No BankDetails were seeded — the payout module's own decision to
    // flag this rather than silently drop it is part of the integration.
    expect(payouts[0].failureReason).toMatch(/no bank details/i);

    expect(emailService.sendPurchaseConfirmation).toHaveBeenCalled();
    expect(emailService.sendSellerNotification).toHaveBeenCalled();
  });

  it('prevents two concurrent checkouts from both reserving the same single_global coupon', async () => {
    await Coupon.create({ code: 'ONCE', usageMode: 'single_global', discountType: 'flat', discountValue: 100, active: true });

    const otherBuyer = await User.__seed({ name: 'Buyer Two', email: 'buyer2@example.com', password: 'password123', isVerified: true });
    const otherWebsite = Website.__seed({
      _id: 'website-2', name: 'other-saas.com', category: 'paid', price: 5000, status: 'approved',
      sellerId: { _id: seller._id, email: seller.email },
    });

    // Same coupon code, two different buyers checking out two different
    // websites at (logically) the same time — the reservation must only
    // ever succeed for one of them, never both. The loser hits the same
    // expected console.error as the single-checkout rejection case above.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resA;
    let resB;
    try {
      [resA, resB] = await Promise.all([
        request(app).post('/api/payment/create-order').set('Authorization', authHeaderFor(buyer)).send({ websiteId: website._id, couponCode: 'ONCE' }),
        request(app).post('/api/payment/create-order').set('Authorization', authHeaderFor(otherBuyer)).send({ websiteId: otherWebsite._id, couponCode: 'ONCE' }),
      ]);
    } finally {
      consoleErrorSpy.mockRestore();
    }

    const statuses = [resA.status, resB.status].sort();
    // One request reserves the coupon (201); the other must be rejected —
    // never both succeeding, which would double-book a single_global coupon.
    expect(statuses).toEqual([201, 409]);

    const coupon = Coupon.__all()[0];
    expect(coupon.usageCount).toBe(0); // reserved, not consumed yet
    const winnerId = resA.status === 201 ? buyer._id : otherBuyer._id;
    expect(String(coupon.reservedByUserId)).toBe(String(winnerId));
  });

  it('releases the coupon reservation when Razorpay reports the payment failed, so it becomes reservable again', async () => {
    await Coupon.create({ code: 'RETRYME', usageMode: 'single_global', discountType: 'flat', discountValue: 200, active: true });

    const orderRes = await request(app)
      .post('/api/payment/create-order')
      .set('Authorization', authHeaderFor(buyer))
      .send({ websiteId: website._id, couponCode: 'RETRYME' });
    expect(orderRes.status).toBe(201);
    expect(Coupon.__all()[0].reservedByPaymentId).toBeTruthy();

    razorpayInstance.payments.fetch.mockResolvedValue({ id: 'pay_failed1', status: 'failed' });

    const [paymentRecord] = require('../../mocks/models/payment.model.mock').__all();
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${paymentRecord.razorpayOrderId}|pay_failed1`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/payment/verify')
      .set('Authorization', authHeaderFor(buyer))
      .send({ razorpayOrderId: paymentRecord.razorpayOrderId, razorpayPaymentId: 'pay_failed1', razorpaySignature: signature });

    expect(verifyRes.status).toBe(400);

    // Failure must propagate all the way back to the Coupon module: the
    // reservation is released, not left dangling.
    const coupon = Coupon.__all()[0];
    expect(coupon.reservedByPaymentId).toBeNull();
    expect(coupon.reservedByUserId).toBeNull();
    expect(coupon.usageCount).toBe(0);
    expect(Purchase.__all()).toHaveLength(0);
  });

  it('rejects checkout for a coupon reserved by a different in-flight checkout, without touching Payment/Purchase state', async () => {
    const activeCoupon = await Coupon.create({ code: 'HELD', usageMode: 'single_global', discountType: 'flat', discountValue: 50, active: true });
    activeCoupon.reservedByPaymentId = 'some-other-payment';
    activeCoupon.reservedByUserId = 'some-other-user';
    activeCoupon.reservationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await activeCoupon.save();

    // payment.controller intentionally logs this expected rejection via
    // console.error before responding 409 — suppressed only for this test.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let res;
    try {
      res = await request(app)
        .post('/api/payment/create-order')
        .set('Authorization', authHeaderFor(buyer))
        .send({ websiteId: website._id, couponCode: 'HELD' });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(res.status).toBe(409);
    expect(Payment.__all()).toHaveLength(0);
    expect(Purchase.__all()).toHaveLength(0);
  });
});
