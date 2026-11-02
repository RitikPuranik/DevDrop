// Display helpers only. Nothing here decides a price, a limit or an entitlement.

/** Format an integer amount of minor units (paise). Intl is used for presentation, never for arithmetic. */
export function formatMoney(minor, currency = 'INR') {
  const n = Number(minor || 0) / 100;
  const whole = Number.isInteger(n);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(n);
}

export function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export const percentLabel = (bps) => `${(Number(bps || 0) / 100).toFixed(Number(bps) % 100 ? 1 : 0)}%`;

export const errorInfo = (err) => {
  const d = err?.response?.data || {};
  return { code: d.code || null, message: d.message || err?.message || 'Something went wrong. Please try again.', data: d.data || null, status: err?.response?.status || null };
};

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayPromise = null;
export function loadRazorpay() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayPromise) return razorpayPromise;
  razorpayPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Payment SDK unavailable')));
    script.onerror = () => { razorpayPromise = null; reject(new Error('Could not load the payment SDK')); };
    document.body.appendChild(script);
  });
  return razorpayPromise;
}

/**
 * Maps a structured backend error from the generation endpoints to the modal that should be shown.
 * Returns null for errors that are not billing/entitlement related (they keep their normal handling).
 */
export function quotaModalFromError(err) {
  const { code, data, message } = errorInfo(err);
  switch (code) {
    case 'PLAN_UPGRADE_REQUIRED':
    case 'FEATURE_NOT_IN_PLAN': return { variant: 'unlock', code, message, data: data || {} };
    case 'GENERATION_QUOTA_EXCEEDED':
    case 'EDIT_QUOTA_EXCEEDED': return { variant: 'quota', code, message, data: data || {} };
    case 'SUBSCRIPTION_INACTIVE': return { variant: 'inactive', code, message, data: data || {} };
    case 'FAIR_USE_LIMIT_REACHED': return { variant: 'fair', code, message, data: data || {} };
    default: return null;
  }
}

/** Where the modal buttons send the user. Pricing lives inside the workspace. */
export const pricingPath = (planId) => `/workspace?section=pricing${planId ? `&plan=${encodeURIComponent(planId)}` : ''}`;
