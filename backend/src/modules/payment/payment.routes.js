const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { paymentLimiter } = require('../../shared/middleware/rateLimit');
const paymentController = require('./payment.controller');

router.post('/create-order', auth, verifyEmail, paymentLimiter, paymentController.createOrder);
router.post('/verify',       auth, paymentController.verifyPayment);
router.post('/webhook',      express.raw({ type: 'application/json' }), paymentController.handleWebhook);
router.post('/refund',       auth, paymentController.createRefund);

module.exports = router;
