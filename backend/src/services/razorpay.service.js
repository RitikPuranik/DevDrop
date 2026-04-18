const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================================
// PAYMENT FUNCTIONS
// ============================================================

/**
 * Create a Razorpay order
 */
const createOrder = async (orderId, amount, currency = 'INR') => {
  try {
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise (smallest currency unit)
      currency,
      receipt: orderId,
    };

    const order = await razorpay.orders.create(options);
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
    const order = await razorpay.orders.fetch(razorpayOrderId);
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
    const payment = await razorpay.payments.fetch(razorpayPaymentId);
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

/**
 * Create refund for a payment
 */
const createRefund = async (razorpayPaymentId, amount, notes = {}) => {
  try {
    const refund = await razorpay.payments.refund(razorpayPaymentId, {
      amount: Math.round(amount * 100), // paise
      notes,
    });
    return refund;
  } catch (error) {
    console.error('Razorpay create refund error:', error);
    throw new Error(error?.error?.description || error.message);
  }
};

module.exports = {
  createOrder,
  fetchOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createRefund,
};
