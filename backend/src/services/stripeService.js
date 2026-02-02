const stripe = require('../config/stripe');

/**
 * Create Payment Intent
 */
const createPaymentIntent = async (amount, currency, metadata) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to smallest currency unit (paise/cents)
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  } catch (error) {
    console.error('Create payment intent error:', error);
    throw error;
  }
};

/**
 * Retrieve Payment Intent
 */
const retrievePaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Retrieve payment intent error:', error);
    throw error;
  }
};

/**
 * Cancel Payment Intent
 */
const cancelPaymentIntent = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Cancel payment intent error:', error);
    throw error;
  }
};

/**
 * Create Refund
 */
const createRefund = async (paymentIntentId, amount = null, reason = null) => {
  try {
    const refundData = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100);
    }

    if (reason) {
      refundData.reason = reason; // 'duplicate', 'fraudulent', 'requested_by_customer'
    }

    const refund = await stripe.refunds.create(refundData);
    return refund;
  } catch (error) {
    console.error('Create refund error:', error);
    throw error;
  }
};

/**
 * Retrieve Refund
 */
const retrieveRefund = async (refundId) => {
  try {
    const refund = await stripe.refunds.retrieve(refundId);
    return refund;
  } catch (error) {
    console.error('Retrieve refund error:', error);
    throw error;
  }
};

/**
 * Verify Webhook Signature
 */
const verifyWebhookSignature = (payload, signature, secret) => {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return event;
  } catch (error) {
    console.error('Webhook verification error:', error);
    throw error;
  }
};

/**
 * Create Customer (for future use with Stripe Connect)
 */
const createCustomer = async (email, metadata = {}) => {
  try {
    const customer = await stripe.customers.create({
      email,
      metadata,
    });
    return customer;
  } catch (error) {
    console.error('Create customer error:', error);
    throw error;
  }
};

/**
 * Create Payment Method (for saving cards)
 */
const createPaymentMethod = async (type, card) => {
  try {
    const paymentMethod = await stripe.paymentMethods.create({
      type,
      card,
    });
    return paymentMethod;
  } catch (error) {
    console.error('Create payment method error:', error);
    throw error;
  }
};

/**
 * List Payment Intents (for admin dashboard)
 */
const listPaymentIntents = async (limit = 10, startingAfter = null) => {
  try {
    const options = { limit };
    if (startingAfter) {
      options.starting_after = startingAfter;
    }

    const paymentIntents = await stripe.paymentIntents.list(options);
    return paymentIntents;
  } catch (error) {
    console.error('List payment intents error:', error);
    throw error;
  }
};

/**
 * Get Balance (platform balance)
 */
const getBalance = async () => {
  try {
    const balance = await stripe.balance.retrieve();
    return balance;
  } catch (error) {
    console.error('Get balance error:', error);
    throw error;
  }
};

/**
 * Create Transfer (for Stripe Connect - future implementation)
 */
const createTransfer = async (amount, destination, metadata = {}) => {
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: 'inr',
      destination,
      metadata,
    });
    return transfer;
  } catch (error) {
    console.error('Create transfer error:', error);
    throw error;
  }
};

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  createRefund,
  retrieveRefund,
  verifyWebhookSignature,
  createCustomer,
  createPaymentMethod,
  listPaymentIntents,
  getBalance,
  createTransfer,
};