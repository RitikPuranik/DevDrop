const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const verifyEmail = require('../middleware/verifyEmail');
const { validators, handleValidationErrors } = require('../utils/validators');
const sellerController = require('../controllers/sellerController');

// All routes require authentication
router.use(auth);

/**
 * @route   POST /api/seller/websites
 * @desc    Submit website for review (requires email verification)
 * @access  Private (Verified users only)
 */
router.post(
  '/websites',
  verifyEmail, // Blocks unverified users
  [
    validators.websiteName(),
    validators.description(),
    validators.category(),
    validators.price(),
    validators.url('deployedUrl'),
    handleValidationErrors,
  ],
  sellerController.submitWebsite
);

/**
 * @route   GET /api/seller/websites
 * @desc    Get seller's uploaded websites
 * @access  Private
 */
router.get('/websites', sellerController.getMyWebsites);

/**
 * @route   PUT /api/seller/websites/:id
 * @desc    Update website (only if changes_requested)
 * @access  Private
 */
router.put('/websites/:id', sellerController.updateWebsite);

/**
 * @route   DELETE /api/seller/websites/:id
 * @desc    Delete own website (only if not approved/sold)
 * @access  Private
 */
router.delete('/websites/:id', sellerController.deleteOwnWebsite);

/**
 * @route   GET /api/seller/earnings
 * @desc    Get seller earnings
 * @access  Private
 */
router.get('/earnings', sellerController.getEarnings);

/**
 * @route   GET /api/seller/payouts
 * @desc    Get seller payouts
 * @access  Private
 */
router.get('/payouts', sellerController.getPayouts);

module.exports = router;