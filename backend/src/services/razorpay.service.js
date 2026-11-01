const Razorpay = require('razorpay');
const crypto = require('crypto');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Lazy Razorpay instance — created on first use so the server can start without keys in dev
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

// ============================================================
// PAYMENT FUNCTIONS
// ============================================================

/**
 * Create a Razorpay order
 */
const createOrder = async (orderId, amount, currency = 'INR') => {
  try {
    let finalAmount = Math.round(amount * 100);
    // Razorpay test mode limit is 500,000 INR (50,000,000 paise)
    if (process.env.NODE_ENV !== 'production' && finalAmount > 50000000) {
      finalAmount = 50000000;
    }

    const options = {
      amount: finalAmount, // Razorpay expects paise (smallest currency unit)
      currency,
      receipt: orderId,
    };

    const order = await getRazorpay().orders.create(options);
    return order;
  } catch (error) {
    console.error('Razorpay create order error:', error);
    throw new Error(error?.error?.description || error.message);
  }
};

/**
 * Fetch order details
 */
const fetchOrder = async (razorpayOrderId) => {
  try {
    const order = await getRazorpay().orders.fetch(razorpayOrderId);
    return order;
  } catch (error) {
    console.error('Razorpay fetch order error:', error);
    throw new Error(error?.error?.description || error.message);
  }
};

/**
 * Fetch payment details by payment ID
 */
const fetchPayment = async (razorpayPaymentId) => {
  try {
    const payment = await getRazorpay().payments.fetch(razorpayPaymentId);
    return payment;
  } catch (error) {
    console.error('Razorpay fetch payment error:', error);
    throw new Error(error?.error?.description || error.message);
  }
};

/**
 * Verify Razorpay payment signature
 * Call this after the frontend completes checkout
 */
const verifyPaymentSignature = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  try {
    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
    return safeEqual(expectedSignature, razorpaySignature);
  } catch (error) {
    console.error('Razorpay signature verification error:', error);
    throw error;
  }
};

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (rawBody, razorpaySignature) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return safeEqual(expectedSignature, razorpaySignature);
  } catch (error) {
    console.error('Razorpay webhook verification error:', error);
    throw error;
  }
};

/**
 * Create an order for an amount that is ALREADY in minor units (paise). Used by subscription billing, where the
 * amount is computed server-side as integers; no float math and no test-mode amount clamping.
 */
const createOrderMinor = async (receipt, amountMinor, currency = 'INR', notes = {}) => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new Error('Invalid order amount');
  try {
    return await getRazorpay().orders.create({ amount: amountMinor, currency, receipt, notes });
  } catch (error) {
    console.error('Razorpay create order (minor) error:', error?.error?.description || error.message);
    throw new Error(error?.error?.description || error.message);
  }
};

/** Payments attempted against an order (trusted server-to-server read). */
const fetchOrderPayments = async (razorpayOrderId) => {
  try {
    const res = await getRazorpay().orders.fetchPayments(razorpayOrderId);
    return res?.items || [];
  } catch (error) {
    console.error('Razorpay fetch order payments error:', error?.error?.description || error.message);
    throw new Error(error?.error?.description || error.message);
  }
};

module.exports = {
  createOrderMinor,
  fetchOrderPayments,
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
