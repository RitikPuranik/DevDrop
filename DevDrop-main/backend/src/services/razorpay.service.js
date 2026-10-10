const Razorpay = require('razorpay');
const crypto = require('crypto');

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
    return expectedSignature === razorpaySignature;
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
    return expectedSignature === razorpaySignature;
  } catch (error) {
    console.error('Razorpay webhook verification error:', error);
    throw error;
  }
};

module.exports = {
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
