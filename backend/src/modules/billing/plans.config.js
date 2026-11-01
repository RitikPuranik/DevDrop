'use strict';

/**
 * Authoritative plan catalogue. The backend is the single source of truth: the frontend only renders
 * what GET /api/billing/plans returns. All money is INTEGER MINOR UNITS (paise).
 *
 * Monthly prices can be set from env: BILLING_PRICE_PRO / BILLING_PRICE_PLUS (rupees). Yearly prices are always derived.
 */
const CURRENCY = 'INR';
const INTERVALS = ['monthly', 'yearly'];
const MONTHS = { monthly: 1, yearly: 12 };
const FAIR_USE_EDITS_PER_HOUR = 60; // safeguard behind "unlimited" AI edits on paid plans

const optInt = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
/** "799" or "799.50" (rupees) -> 79900 / 79950 paise, using string parsing so no float error can creep in. null if invalid. */
const rupeesToMinor = (value) => {
  if (value === undefined || value === null) return null;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0') || 0);
};
const intOr = (value, fallback) => {
  const n = optInt(value);
  return n === null ? fallback : n;
};

function getBillingSettings(env = process.env) {
  const taxMode = ['inclusive', 'exclusive', 'none'].includes(env.BILLING_TAX_MODE) ? env.BILLING_TAX_MODE : 'inclusive';
  return {
    currency: CURRENCY,
    platformFeeMinor: 0, // spec: no platform / checkout fee
    // Tax handling is a merchant/legal decision. Default: listed prices are tax-inclusive (payable == listed price).
    // 'exclusive' adds TAX_PERCENTAGE on top; 'none' must be chosen explicitly and verified by the merchant.
    tax: { mode: taxMode, percentBps: Math.round((Number(env.BILLING_TAX_PERCENT ?? env.TAX_PERCENTAGE ?? 18) || 0) * 100), label: env.BILLING_TAX_LABEL || 'GST' },
    graceDays: intOr(env.BILLING_GRACE_DAYS, 0),
    renewalWindowDays: intOr(env.BILLING_RENEWAL_WINDOW_DAYS, 7),
    checkoutHoldMinutes: intOr(env.BILLING_CHECKOUT_HOLD_MINUTES, 30),
    fairUseEditsPerHour: FAIR_USE_EDITS_PER_HOUR,
    // Quota windows for paid plans: calendar months from the subscription anchor, for monthly AND yearly billing.
    quotaResetCadence: 'monthly',
    legacyProjectsBefore: env.BILLING_LEGACY_PROJECTS_BEFORE ? new Date(env.BILLING_LEGACY_PROJECTS_BEFORE) : null,
  };
}

function featureList({ generationQuota, quotaPeriod, aiEdits, tierLabel }) {
  const gen = quotaPeriod === 'monthly_calendar'
    ? `${generationQuota} website generation per month`
    : `${generationQuota} website generations per billing cycle`;
  const items = [gen];
  items.push(aiEdits.unlimited ? 'Unlimited AI edits (fair use applies)' : `${aiEdits.limit} AI edits per month`);
  items.push(`${tierLabel} AI generation`);
  items.push(tierLabel === 'Standard' ? 'Basic page allowance' : 'More pages per website');
  return items;
}

// Monthly price from env: BILLING_PRICE_PRO=799 (rupees) wins, then BILLING_PRICE_PRO_MINOR=79900 (paise), then the default.
// Yearly prices are never configured: they are always derived from this value and the plan's annual discount.
function monthlyPrice(env, def) {
  if (def.monthlyPriceMinor === 0) return 0; // Free stays free
  const rupees = rupeesToMinor(env[`BILLING_PRICE_${def.envKey}`]);
  if (rupees !== null && rupees >= 100) return rupees; // provider minimum is ₹1
  const minor = optInt(env[`BILLING_PRICE_${def.envKey}_MINOR`]);
  return minor !== null && minor >= 100 ? minor : def.monthlyPriceMinor;
}

function buildPlans(env = process.env) {
  const settings = getBillingSettings(env);
  const make = (def) => {
    const aiEdits = def.editLimit === null ? { limit: null, unlimited: true, fairUsePerHour: settings.fairUseEditsPerHour } : { limit: def.editLimit, unlimited: false, fairUsePerHour: null };
    return {
      id: def.id,
      name: def.name,
      rank: def.rank,
      description: def.description,
      currency: CURRENCY,
      monthlyPriceMinor: monthlyPrice(env, def),
      annualDiscountBps: def.annualDiscountBps,
      generationQuota: def.generationQuota,
      quotaPeriod: def.quotaPeriod, // 'monthly_calendar' (Free: resets on the 1st, IST) | 'billing_cycle' (paid: resets monthly from the subscription date)
      aiEdits,
      generationTierLabel: def.tierLabel,
      features: featureList({ generationQuota: def.generationQuota, quotaPeriod: def.quotaPeriod, aiEdits, tierLabel: def.tierLabel }),
      available: true,
      purchasable: def.monthlyPriceMinor > 0,
      recommended: Boolean(def.recommended),
      premium: Boolean(def.premium),
      cta: def.cta,
    };
  };

  return {
    free: make({ id: 'free', envKey: 'FREE', name: 'Free', rank: 0, description: 'Try DevDrop AI on your first website.', monthlyPriceMinor: 0, annualDiscountBps: 0, generationQuota: 1, quotaPeriod: 'monthly_calendar', editLimit: 5, tierLabel: 'Standard', cta: 'Get Started' }),
    pro: make({ id: 'pro', envKey: 'PRO', name: 'Pro', rank: 1, description: 'For builders shipping websites regularly.', monthlyPriceMinor: 79900, annualDiscountBps: 500, generationQuota: 20, quotaPeriod: 'billing_cycle', editLimit: null, tierLabel: 'Better', recommended: true, cta: 'Upgrade to Pro' }),
    plus: make({ id: 'plus', envKey: 'PLUS', name: 'Plus', rank: 2, description: 'For studios and power users who build at volume.', monthlyPriceMinor: 129900, annualDiscountBps: 1000, generationQuota: 50, quotaPeriod: 'billing_cycle', editLimit: null, tierLabel: 'Better', premium: true, cta: 'Upgrade to Plus' }),
  };
}

const getPlans = (env = process.env) => buildPlans(env);
const getPlan = (id, env = process.env) => buildPlans(env)[id] || null;

module.exports = { CURRENCY, INTERVALS, MONTHS, getBillingSettings, getPlans, getPlan, optInt };
