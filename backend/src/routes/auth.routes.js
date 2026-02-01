const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { validators, handleValidationErrors } = require('../utils/validators');

/**
 * @route   POST /api/auth/signup
 * @desc    Register new user
 * @access  Public
 */
router.post(
  '/signup',
  authLimiter,
  [
    validators.email(),
    validators.password(),
    handleValidationErrors,
  ],
  authController.signup
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  [
    validators.email(),
    validators.password(),
    handleValidationErrors,
  ],
  authController.login
);

/**
 * @route   POST /api/auth/send-verification
 * @desc    Send email verification
 * @access  Private
 */
router.post(
  '/send-verification',
  auth,
  authController.sendVerificationEmail
);


/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify user email
 * @access  Public
 */
router.post('/verify-email', authController.verifyEmail);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend verification email
 * @access  Private
 */
router.post('/resend-verification', auth, authController.resendVerification);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', auth, authController.getMe);

module.exports = router;