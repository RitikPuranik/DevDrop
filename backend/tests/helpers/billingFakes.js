'use strict';

// Builds the fake billing collections once per test file and exposes reset().
const { makeCollection } = require('./fakeMongo');

const build = () => {
  const cols = {
    Subscription: makeCollection({ unique: ['userId'], defaults: { status: 'active', cancelAtPeriodEnd: false, endReason: null, cancelledAt: null, lastOrderId: null, lastPaidMinor: 0, lastTermMs: 0 } }),
    BillingOrder: makeCollection({ unique: ['razorpayOrderId', 'razorpayPaymentId'], sparse: ['razorpayOrderId', 'razorpayPaymentId'], defaults: { status: 'created', currency: 'INR', appliedAt: null, paidAt: null, periodStart: null, periodEnd: null, processedEventIds: [], failureReason: null, couponId: null, couponCode: null } }),
    UsageCounter: makeCollection({ unique: [['userId', 'windowKey']], defaults: { generationsUsed: 0, editsUsed: 0 } }),
    GenerationLedger: makeCollection({ unique: ['jobKey'], defaults: { status: 'reserved', counted: true, releasedReason: null } }),
    CouponRedemption: makeCollection({ unique: ['orderId'], defaults: { status: 'reserved' } }),
  };
  const Coupon = makeCollection({ unique: ['code'], defaults: { active: true, redemptionCount: 0, usageCount: 0, firstTimeOnly: false, stackableWithAnnualDiscount: false } });
  const reset = () => { Object.values(cols).forEach((c) => c.__reset()); Coupon.__reset(); };
  return { ...cols, Coupon, reset };
};

// One shared instance per test file (jest module registry is per file), so jest.mock factories and tests see the same data.
module.exports = build();
