'use strict';

const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { paymentLimiter } = require('../../shared/middleware/rateLimit');
const controller = require('./billing.controller');

// Provider -> backend (no user auth; authenticated by Razorpay's HMAC over the raw body).
router.post('/webhook', express.raw({ type: 'application/json' }), controller.webhook);

router.get('/plans', auth, controller.getPlans);
router.get('/subscription', auth, controller.getSubscription);
router.get('/usage', auth, controller.getUsage);
router.get('/orders', auth, controller.getOrders);

router.post('/quote', auth, controller.quote);
router.post('/coupons/validate', auth, paymentLimiter, controller.validateCoupon);
router.post('/checkout', auth, verifyEmail, paymentLimiter, controller.checkout);
router.post('/checkout/verify', auth, paymentLimiter, controller.verify);
router.get('/checkout/:orderId/status', auth, controller.checkoutStatus);

router.post('/subscription/cancel', auth, controller.cancel);
router.post('/subscription/resume', auth, controller.resume);

module.exports = router;
