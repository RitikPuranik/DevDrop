const { getPlans, getBillingSettings } = require('../../../src/modules/billing/plans.config');
const { computeQuote, percentOf } = require('../../../src/modules/billing/money');
const { BillingError } = require('../../../src/modules/billing/errors');

const plans = getPlans();
const settings = getBillingSettings({});
const quote = (o) => computeQuote({ plan: plans[o.plan || 'pro'], interval: o.interval || 'monthly', coupon: o.coupon || null, creditMinor: o.credit || 0, settings: o.settings || settings });
const coupon = (o = {}) => ({ code: 'X', discountType: 'percent', discountValue: 10, maxDiscountMinor: null, minPurchaseMinor: null, stackableWithAnnualDiscount: false, ...o });
const errCode = (fn) => { try { fn(); } catch (e) { return e instanceof BillingError ? e.code : `other:${e.message}`; } return null; };

describe('plan catalogue (backend-owned)', () => {
  it('matches the product configuration, in integer minor units', () => {
    expect(plans.free).toMatchObject({ monthlyPriceMinor: 0, generationQuota: 1, quotaPeriod: 'monthly_calendar', aiEdits: { limit: 5, unlimited: false }, purchasable: false });
    expect(plans.pro).toMatchObject({ monthlyPriceMinor: 79900, annualDiscountBps: 500, generationQuota: 20, aiEdits: { unlimited: true }, recommended: true });
    expect(plans.plus).toMatchObject({ monthlyPriceMinor: 129900, annualDiscountBps: 1000, generationQuota: 50, aiEdits: { unlimited: true }, premium: true });
  });
});

describe('annual pricing', () => {
  it('Pro yearly = ₹9,108.60 (9,588.00 less 5%)', () => {
    const q = quote({ plan: 'pro', interval: 'yearly' });
    expect(q.listPriceMinor).toBe(958800);
    expect(q.annualDiscountBps).toBe(500);
    expect(q.annualDiscountMinor).toBe(47940);
    expect(q.afterAnnualDiscountMinor).toBe(910860);
    expect(q.totalMinor).toBe(910860);
    expect(q.monthlyEquivalentMinor).toBe(75905); // 910860 / 12 = 75905
  });
  it('Plus yearly = ₹14,029.20 (15,588.00 less 10%)', () => {
    const q = quote({ plan: 'plus', interval: 'yearly' });
    expect(q.listPriceMinor).toBe(1558800);
    expect(q.annualDiscountMinor).toBe(155880);
    expect(q.totalMinor).toBe(1402920);
  });
  it('monthly has no annual discount', () => {
    const q = quote({ plan: 'plus', interval: 'monthly' });
    expect(q).toMatchObject({ listPriceMinor: 129900, annualDiscountMinor: 0, totalMinor: 129900 });
  });
  it('Free is not purchasable', () => {
    expect(errCode(() => computeQuote({ plan: plans.free, interval: 'yearly', settings }))).toBe('PLAN_NOT_AVAILABLE');
  });
  it('never produces non-integers', () => {
    for (const plan of ['pro', 'plus']) for (const interval of ['monthly', 'yearly']) {
      for (const c of [null, coupon({ discountValue: 7.5, stackableWithAnnualDiscount: true }), coupon({ discountType: 'flat', discountValue: 33.33, stackableWithAnnualDiscount: true })]) {
        const q = quote({ plan, interval, coupon: c, credit: 12345 });
        [q.listPriceMinor, q.annualDiscountMinor, q.couponDiscountMinor, q.totalMinor, q.tax.amountMinor, q.monthlyEquivalentMinor].forEach((n) => expect(Number.isInteger(n)).toBe(true));
      }
    }
  });
  it('percentOf rounds half-up in integer arithmetic', () => {
    expect(percentOf(1, 5000)).toBe(1);
    expect(percentOf(999, 500)).toBe(50);
  });
});

describe('coupons', () => {
  it('percent coupon on monthly', () => {
    const q = quote({ coupon: coupon({ discountValue: 25 }) });
    expect(q.couponDiscountMinor).toBe(19975); // 25% of 79900
    expect(q.totalMinor).toBe(79900 - 19975);
    expect(q.coupon).toMatchObject({ code: 'X', discountMinor: 19975, stackedWithAnnualDiscount: false });
  });
  it('flat coupon is in rupees and converted to paise', () => {
    expect(quote({ coupon: coupon({ discountType: 'flat', discountValue: 100 }) }).couponDiscountMinor).toBe(10000);
  });
  it('honours maximum discount', () => {
    const q = quote({ coupon: coupon({ discountValue: 50, maxDiscountMinor: 5000 }) });
    expect(q.couponDiscountMinor).toBe(5000);
    expect(q.coupon.cappedBy).toContain('maxDiscount');
  });
  it('never discounts below zero (100% coupon => nothing to pay, no fake charge)', () => {
    const q = quote({ coupon: coupon({ discountValue: 100 }) });
    expect(q.totalMinor).toBe(0);
    expect(q.requiresPayment).toBe(false);
  });
  it('enforces minimum purchase', () => {
    expect(errCode(() => quote({ coupon: coupon({ minPurchaseMinor: 100000 }) }))).toBe('COUPON_MIN_PURCHASE_NOT_MET');
  });
  it('does NOT stack with the annual discount unless explicitly allowed', () => {
    expect(errCode(() => quote({ interval: 'yearly', coupon: coupon() }))).toBe('COUPON_NOT_STACKABLE');
    const q = quote({ interval: 'yearly', coupon: coupon({ discountValue: 10, stackableWithAnnualDiscount: true }) });
    expect(q.annualDiscountMinor).toBe(47940);
    expect(q.couponDiscountMinor).toBe(91086); // 10% of the already-discounted 910860
    expect(q.totalMinor).toBe(910860 - 91086);
    expect(q.coupon.stackedWithAnnualDiscount).toBe(true);
  });
  it('a non-stackable coupon is fine on monthly billing', () => {
    expect(errCode(() => quote({ interval: 'monthly', coupon: coupon() }))).toBeNull();
  });
  it('rejects an amount below the provider minimum rather than charging a broken value', () => {
    expect(errCode(() => quote({ coupon: coupon({ discountType: 'flat', discountValue: 798.5 }) }))).toBe('CHECKOUT_AMOUNT_INVALID');
  });
});

describe('proration credit and tax', () => {
  it('credit reduces the payable amount but never below zero', () => {
    expect(quote({ plan: 'plus', credit: 30000 }).totalMinor).toBe(129900 - 30000);
    expect(quote({ plan: 'pro', credit: 10 ** 9 }).totalMinor).toBe(0);
  });
  it('inclusive tax (default): payable == listed price, tax shown as included', () => {
    const q = quote({ plan: 'pro' });
    expect(q.totalMinor).toBe(79900);
    expect(q.tax).toMatchObject({ mode: 'inclusive', inclusive: true });
    expect(q.tax.amountMinor).toBe(79900 - Math.round(79900 / 1.18));
  });
  it('exclusive tax is added on top and shown separately', () => {
    const q = quote({ plan: 'pro', settings: { ...settings, tax: { ...settings.tax, mode: 'exclusive' } } });
    expect(q.tax.amountMinor).toBe(percentOf(79900, 1800));
    expect(q.totalMinor).toBe(79900 + q.tax.amountMinor);
  });
  it('tax mode none charges no tax and is only used when explicitly configured', () => {
    expect(getBillingSettings({}).tax.mode).toBe('inclusive');
    expect(getBillingSettings({ BILLING_TAX_MODE: 'none' }).tax.mode).toBe('none');
    expect(quote({ plan: 'pro', settings: { ...settings, tax: { ...settings.tax, mode: 'none' } } }).tax.amountMinor).toBe(0);
  });
  it('platform fee is zero', () => {
    expect(quote({}).platformFeeMinor).toBe(0);
  });
});

describe('monthly price from env (yearly is always derived)', () => {
  const quoteFor = (env, plan, interval) => { const p = getPlans(env); return computeQuote({ plan: p[plan], interval, settings: getBillingSettings(env) }); };
  it('BILLING_PRICE_PRO / BILLING_PRICE_PLUS are in rupees and drive monthly and yearly', () => {
    const env = { BILLING_PRICE_PRO: '999', BILLING_PRICE_PLUS: '1499.50' };
    expect(getPlans(env).pro.monthlyPriceMinor).toBe(99900);
    expect(getPlans(env).plus.monthlyPriceMinor).toBe(149950);
    expect(quoteFor(env, 'pro', 'monthly').totalMinor).toBe(99900);
    const y = quoteFor(env, 'pro', 'yearly'); // 999 x 12 = 11,988.00, less 5%
    expect(y.listPriceMinor).toBe(1198800);
    expect(y.totalMinor).toBe(1198800 - 59940);
    const yp = quoteFor(env, 'plus', 'yearly'); // 1499.50 x 12 = 17,994.00, less 10%
    expect(yp.listPriceMinor).toBe(1799400);
    expect(yp.totalMinor).toBe(1799400 - 179940);
  });
  it('the paise variable still works, rupees win when both are set, invalid values fall back to the default', () => {
    expect(getPlans({ BILLING_PRICE_PRO_MINOR: '89900' }).pro.monthlyPriceMinor).toBe(89900);
    expect(getPlans({ BILLING_PRICE_PRO: '999', BILLING_PRICE_PRO_MINOR: '89900' }).pro.monthlyPriceMinor).toBe(99900);
    for (const bad of ['abc', '-5', '0', '12.345', '', '1e3']) expect(getPlans({ BILLING_PRICE_PRO: bad }).pro.monthlyPriceMinor).toBe(79900);
  });
  it('Free can never be given a price by env', () => {
    expect(getPlans({ BILLING_PRICE_FREE: '500' }).free.monthlyPriceMinor).toBe(0);
  });
});
