const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const verifyEmail = require('../middleware/verifyEmail');
const { paymentLimiter } = require('../middleware/rateLimit');
const paymentController = require('../controllers/paymentController');

/**
 * @route   POST /api/payment/create-order
 * @desc    Create Razorpay order (requires email verification)
 * @access  Private (Verified users only)
 */
router.post(
  '/create-order', 
  auth, 
  verifyEmail, 
  paymentLimiter, 
  paymentController.createOrder
);

/**
 * @route   POST /api/payment/verify
 * @desc    Verify Razorpay payment signature
 * @access  Private
 */
router.post('/verify', auth, paymentController.verifyPayment);

/**
 * @route   POST /api/payment/webhook
 * @desc    Razorpay webhook handler
 * @access  Public (verified by Razorpay signature)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleWebhook
);

module.exports = router;