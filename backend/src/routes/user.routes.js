const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { auth } = require('../middleware/auth');
const { validators, handleValidationErrors } = require('../utils/validators');
const { body } = require('express-validator');
const bankSetupController = require('../controllers/bankSetupController'); // Add this

// All routes require authentication
router.use(auth);

/**
 * @route   GET /api/user/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', userController.getProfile);

/**
 * @route   POST /api/user/bank-details
 * @desc    Add/Update bank details
 * @access  Private
 */
router.post(
  '/bank-details',
  [
    body('accountHolderName')
      .trim()
      .notEmpty()
      .withMessage('Account holder name is required'),
    validators.accountNumber(),
    validators.ifscCode(),
    body('bankName')
      .trim()
      .notEmpty()
      .withMessage('Bank name is required'),
    body('branch')
      .trim()
      .notEmpty()
      .withMessage('Branch is required'),
    body('upiId')
      .optional()
      .matches(/^[\w.-]+@[\w.-]+$/)
      .withMessage('Invalid UPI ID format'),
    handleValidationErrors,
  ],
  userController.saveBankDetails
);

/**
 * @route   GET /api/user/bank-details
 * @desc    Get user's bank details
 * @access  Private
 */
router.get('/bank-details', userController.getBankDetails);

/**
 * @route   GET /api/user/dashboard
 * @desc    Get user dashboard data
 * @access  Private
 */
router.get('/dashboard', userController.getDashboard);

/**
 * @route   GET /api/user/purchases
 * @desc    Get user's purchases
 * @access  Private
 */
router.get('/purchases', userController.getPurchases);

// 🔥 NEW ROUTES FOR AUTOMATIC PAYOUTS
router.post('/bank-details/setup-payouts', auth, bankSetupController.setupRazorpayPayouts);
router.post('/bank-details/setup-upi', auth, bankSetupController.setupUPIPayouts);
router.get('/bank-details/payout-status', auth, bankSetupController.getPayoutSetupStatus);
router.post('/bank-details/toggle-payouts', auth, bankSetupController.togglePayouts);

module.exports = router;