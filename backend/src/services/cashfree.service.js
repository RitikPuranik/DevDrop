const { Cashfree } = require('cashfree-pg');
const crypto = require('crypto');
const axios = require('axios');

// Set credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.NODE_ENV === 'production'
  ? Cashfree.Environment.PRODUCTION
  : Cashfree.Environment.SANDBOX;

// Base URL for payout API (separate from payments API)
const PAYOUT_BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://payout-api.cashfree.com'
  : 'https://payout-gamma.cashfree.com';

// ============================================================
// PAYMENT FUNCTIONS
// ============================================================

/**
 * Create a Cashfree order (equivalent to Razorpay order)
 */
const createOrder = async (orderId, amount, currency = 'INR', customer, returnUrl, notifyUrl) => {
  try {
    const orderRequest = {
      order_id: orderId,
      order_amount: amount,
      order_currency: currency,
      customer_details: {
        customer_id: customer.id,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_name: customer.name,
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
      },
    };

    const response = await Cashfree.PGCreateOrder('2023-08-01', orderRequest);
    return response.data;
  } catch (error) {
    console.error('Cashfree create order error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Fetch order details
 */
const fetchOrder = async (orderId) => {
  try {
    const response = await Cashfree.PGFetchOrder('2023-08-01', orderId);
    return response.data;
  } catch (error) {
    console.error('Cashfree fetch order error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Fetch payment details by order ID
 */
const fetchPaymentsByOrderId = async (orderId) => {
  try {
    const response = await Cashfree.PGOrderFetchPayments('2023-08-01', orderId);
    return response.data;
  } catch (error) {
    console.error('Cashfree fetch payments error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Verify webhook signature
 */
const verifyWebhookSignature = (rawBody, signature, timestamp) => {
  try {
    const data = timestamp + rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(data)
      .digest('base64');
    return expectedSignature === signature;
  } catch (error) {
    console.error('Webhook verification error:', error);
    throw error;
  }
};

/**
 * Create refund
 */
const createRefund = async (orderId, refundId, amount, reason = 'Refund requested') => {
  try {
    const refundRequest = {
      refund_amount: amount,
      refund_id: refundId,
      refund_note: reason,
    };
    const response = await Cashfree.PGOrderCreateRefund('2023-08-01', orderId, refundRequest);
    return response.data;
  } catch (error) {
    console.error('Cashfree create refund error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

// ============================================================
// PAYOUT FUNCTIONS (Cashfree Payouts API — much simpler!)
// ============================================================

/**
 * Get payout auth token (Cashfree payouts use a separate token)
 */
let payoutToken = null;
let payoutTokenExpiry = null;

const getPayoutToken = async () => {
  try {
    // Reuse token if still valid (expires every 5 mins, refresh every 4)
    if (payoutToken && payoutTokenExpiry && Date.now() < payoutTokenExpiry) {
      return payoutToken;
    }

    const response = await axios.post(
      `${PAYOUT_BASE_URL}/payout/v1/authorize`,
      {},
      {
        headers: {
          'X-Client-Id': process.env.CASHFREE_APP_ID,
          'X-Client-Secret': process.env.CASHFREE_SECRET_KEY,
        },
      }
    );

    payoutToken = response.data.data.token;
    payoutTokenExpiry = Date.now() + 4 * 60 * 1000; // 4 minutes
    return payoutToken;
  } catch (error) {
    console.error('Get payout token error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Add beneficiary (seller's bank account)
 * Cashfree doesn't need a "contact" + "fund account" like Razorpay
 * Just one simple call to add a beneficiary
 */
const addBeneficiary = async ({ beneficiaryId, name, email, phone, bankAccount, ifsc, upiId }) => {
  try {
    const token = await getPayoutToken();

    const body = {
      beneId: beneficiaryId,
      name,
      email,
      phone,
    };

    // Either bank account OR UPI
    if (upiId) {
      body.vpa = upiId;
    } else {
      body.bankAccount = bankAccount;
      body.ifsc = ifsc;
    }

    const response = await axios.post(
      `${PAYOUT_BASE_URL}/payout/v1/addBeneficiary`,
      body,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data;
  } catch (error) {
    console.error('Add beneficiary error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Get beneficiary details
 */
const getBeneficiary = async (beneficiaryId) => {
  try {
    const token = await getPayoutToken();
    const response = await axios.get(
      `${PAYOUT_BASE_URL}/payout/v1/getBeneficiary/${beneficiaryId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    // 404 means not found — not an actual error for our use case
    if (error?.response?.status === 404) return null;
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Send payout to seller — the main money transfer call
 * transferId must be unique per transfer
 */
const createPayout = async ({ transferId, beneficiaryId, amount, remarks, mode = 'banktransfer' }) => {
  try {
    const token = await getPayoutToken();

    const body = {
      beneId: beneficiaryId,
      amount: amount.toString(),
      transferId,
      transferMode: mode, // 'banktransfer' or 'upi'
      remarks: remarks || 'Website marketplace payout',
    };

    const response = await axios.post(
      `${PAYOUT_BASE_URL}/payout/v1/requestTransfer`,
      body,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data;
  } catch (error) {
    console.error('Create payout error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

/**
 * Get transfer status
 */
const getTransferStatus = async (transferId) => {
  try {
    const token = await getPayoutToken();
    const response = await axios.get(
      `${PAYOUT_BASE_URL}/payout/v1/getTransferStatus?transferId=${transferId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error('Get transfer status error:', error?.response?.data || error.message);
    throw new Error(error?.response?.data?.message || error.message);
  }
};

module.exports = {
  // Payments
  createOrder,
  fetchOrder,
  fetchPaymentsByOrderId,
  verifyWebhookSignature,
  createRefund,
  // Payouts
  addBeneficiary,
  getBeneficiary,
  createPayout,
  getTransferStatus,
};
