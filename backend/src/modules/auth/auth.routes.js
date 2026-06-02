const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('./auth.controller');
const { auth } = require('../../shared/middleware/auth');
const { authLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');

router.post('/signup', authLimiter, [validators.name(), validators.email(), validators.password(), handleValidationErrors], authController.signup);
router.post('/login', authLimiter, [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required'), validators.password(), handleValidationErrors], authController.login);

// Google OAuth
router.post('/google', authLimiter, [body('credential').notEmpty().withMessage('Google credential is required'), handleValidationErrors], authController.googleAuth);

router.post('/send-verification', auth, authController.sendVerificationEmail);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', auth, authController.resendVerification);
router.get('/me', auth, authController.getMe);
router.post('/forgot-password', validators.email(), handleValidationErrors, authController.forgotPassword);
router.post('/reset-password', validators.password(), handleValidationErrors, authController.resetPassword);

module.exports = router;
