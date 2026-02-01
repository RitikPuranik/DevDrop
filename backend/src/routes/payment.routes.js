const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const verifyEmail = require('../middleware/verifyEmail');
const { paymentLimiter } = require('../middleware/rateLimit');
const paymentController = require('../controllers/paymentController');

/**
 * @route   POST /api/payment/create-payment-intent
 * @desc    Create Stripe payment intent (requires email verification)
 * @access  Private (Verified users only)
 */
router.post(
  '/create-payment-intent', 
  auth, 
  verifyEmail, 
  paymentLimiter, 
  paymentController.createPaymentIntent
);

/**
 * @route   POST /api/payment/confirm
 * @desc    Confirm Stripe payment
 * @access  Private
 */
router.post('/confirm', auth, paymentController.confirmPayment);

/**
 * @route   POST /api/payment/webhook
 * @desc    Stripe webhook handler
 * @access  Public (verified by Stripe signature)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }), // Important for Stripe
  paymentController.handleWebhook
);

module.exports = router;