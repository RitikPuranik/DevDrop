const razorpay = require('../config/razorpay');
const crypto = require('crypto');

/**
 * Create Order
 */
const createOrder = async (amount, currency, receipt, notes = {}) => {
  try {
    const options = {
      amount: Math.round(amount * 100),
      currency: currency.toUpperCase(),
      receipt,
      notes,
    };

    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Create order error:', error);
    throw error;
  }
};

/**
 * Fetch Order
 */
const fetchOrder = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error('Fetch order error:', error);
    throw error;
  }
};

/**
 * Capture Payment
 */
const capturePayment = async (paymentId, amount, currency = 'INR') => {
  try {
    const payment = await razorpay.payments.capture(paymentId, Math.round(amount * 100), currency);
    return payment;
  } catch (error) {
    console.error('Capture payment error:', error);
    throw error;
  }
};

/**
 * Fetch Payment
 */
const fetchPayment = async (paymentId) => {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Fetch payment error:', error);
    throw error;
  }
};

/**
 * Create Refund
 */
const createRefund = async (paymentId, amount = null, notes = {}) => {
  try {
    const options = {
      payment_id: paymentId,
    };

    if (amount) {
      options.amount = Math.round(amount * 100);
    }

    if (Object.keys(notes).length > 0) {
      options.notes = notes;
    }

    const refund = await razorpay.payments.refund(options);
    return refund;
  } catch (error) {
    console.error('Create refund error:', error);
    throw error;
  }
};

/**
 * Fetch Refund
 */
const fetchRefund = async (refundId) => {
  try {
    const refund = await razorpay.refunds.fetch(refundId);
    return refund;
  } catch (error) {
    console.error('Fetch refund error:', error);
    throw error;
  }
};

/**
 * Verify Payment Signature
 */
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Signature verification error:', error);
    throw error;
  }
};

// ==================== 🔥 NEW PAYOUT FUNCTIONS ====================

/**
 * Create Contact (for payouts)
 */
const createContact = async (name, email, contact, type = 'vendor') => {
  try {
    const contactData = {
      name,
      email,
      contact,
      type,
      reference_id: `user_${Date.now()}`,
    };

    const response = await razorpay.contacts.create(contactData);
    return response;
  } catch (error) {
    console.error('Create contact error:', error);
    throw error;
  }
};

/**
 * Create Fund Account (for payouts)
 */
const createFundAccount = async (contactId, accountType, accountDetails) => {
  try {
    const fundAccountData = {
      contact_id: contactId,
      account_type: accountType,
      [accountType]: accountDetails[accountType],
    };

    const response = await razorpay.fundAccounts.create(fundAccountData);
    return response;
  } catch (error) {
    console.error('Create fund account error:', error);
    throw error;
  }
};

/**
 * Create Instant Payout
 */
const createPayout = async (fundAccountId, amount, currency = 'INR', mode = 'IMPS', purpose = 'payout', notes = {}) => {
  try {
    // IMPORTANT: This is your RazorpayX account number from .env
    const payoutData = {
      account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: Math.round(amount * 100),
      currency,
      mode,
      purpose,
      queue_if_low_balance: true, // Will queue if balance low instead of failing
      notes,
    };

    const response = await razorpay.payouts.create(payoutData);
    return response;
  } catch (error) {
    console.error('Create payout error:', error);
    throw error;
  }
};

/**
 * Fetch Payout
 */
const fetchPayout = async (payoutId) => {
  try {
    const payout = await razorpay.payouts.fetch(payoutId);
    return payout;
  } catch (error) {
    console.error('Fetch payout error:', error);
    throw error;
  }
};

/**
 * Verify Webhook Signature
 */
const verifyWebhookSignature = (payload, signature, secret) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    console.error('Webhook verification error:', error);
    throw error;
  }
};

/**
 * Get Payouts (for admin)
 */
const getPayouts = async (filters = {}) => {
  try {
    const response = await razorpay.payouts.all(filters);
    return response;
  } catch (error) {
    console.error('Get payouts error:', error);
    throw error;
  }
};

module.exports = {
  // Payment functions
  createOrder,
  fetchOrder,
  capturePayment,
  fetchPayment,
  createRefund,
  fetchRefund,
  verifyPaymentSignature,
  
  // Payout functions 🔥
  createContact,
  createFundAccount,
  createPayout,
  fetchPayout,
  verifyWebhookSignature,
  getPayouts,
};