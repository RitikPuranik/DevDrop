'use strict';

// Structured, user-safe billing errors. `code` is the stable contract the frontend maps to UI
// (modals, inline messages); `message` is always safe to show. Internal details never go in `details`.
const HTTP_STATUS = {
  PLAN_UPGRADE_REQUIRED: 403,
  GENERATION_QUOTA_EXCEEDED: 402,
  EDIT_QUOTA_EXCEEDED: 402,
  FAIR_USE_LIMIT_REACHED: 429,
  SUBSCRIPTION_INACTIVE: 403,
  PLAN_NOT_AVAILABLE: 400,
  PLAN_DOWNGRADE_NOT_ALLOWED: 409,
  ALREADY_SUBSCRIBED: 409,
  INVALID_BILLING_INTERVAL: 400,
  CHECKOUT_AMOUNT_INVALID: 400,
  CHECKOUT_NOT_FOUND: 404,
  PAYMENT_VERIFICATION_FAILED: 400,
  PAYMENT_PROVIDER_UNAVAILABLE: 503,
  COUPON_INVALID: 400,
  COUPON_EXPIRED: 400,
  COUPON_INACTIVE: 400,
  COUPON_EXHAUSTED: 400,
  COUPON_USER_LIMIT_REACHED: 400,
  COUPON_MIN_PURCHASE_NOT_MET: 400,
  COUPON_NOT_ELIGIBLE: 400,
  COUPON_NOT_STACKABLE: 400,
  COUPON_FIRST_TIME_ONLY: 400,
  NO_ACTIVE_SUBSCRIPTION: 404,
};

class BillingError extends Error {
  constructor(code, message, details = undefined, status = undefined) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.status = status || HTTP_STATUS[code] || 400;
    this.details = details;
  }
}

// Send a BillingError (or fall back to a generic 500) in the structured envelope.
function sendBillingError(res, error, fallbackMessage = 'Billing request failed') {
  if (error instanceof BillingError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.details ? { data: error.details } : {}) });
  }
  console.error('Billing error:', error?.message);
  return res.status(500).json({ success: false, code: 'BILLING_INTERNAL_ERROR', message: fallbackMessage });
}

module.exports = { BillingError, sendBillingError, HTTP_STATUS };
