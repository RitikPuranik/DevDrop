const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('./auth.controller');
const { auth } = require('../../shared/middleware/auth');
const { authLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');

router.post('/signup', authLimiter, [
  validators.name(),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{10}$/)
    .withMessage('Please provide a valid 10-digit phone number'),
  validators.email(),
  validators.password(),
  handleValidationErrors,
], authController.signup);
router.post('/login', authLimiter, [body('emailOrPhone').trim().notEmpty().withMessage('Email or phone is required'), validators.password(), handleValidationErrors], authController.login);

// Google OAuth
router.post('/google', authLimiter, [body('credential').notEmpty().withMessage('Google credential is required'), handleValidationErrors], authController.googleAuth);

// GitHub OAuth ("Continue with GitHub") — separate from the GitHub
// *integration* OAuth under /api/github (repo export), which has its own
// state/scope/callback. GitHub redirects the browser straight to /callback
// with no Authorization header, so that route must stay public.
router.get('/github', authLimiter, authController.githubAuthRedirect);
router.get('/github/callback', authController.githubAuthCallback);

router.post('/send-verification', auth, authController.sendVerificationEmail);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification', auth, authController.resendVerification);
router.get('/me', auth, authController.getMe);
router.post('/forgot-password', validators.email(), handleValidationErrors, authController.forgotPassword);
router.post('/reset-password', validators.password(), handleValidationErrors, authController.resetPassword);

module.exports = router;
