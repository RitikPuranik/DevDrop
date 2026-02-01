const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const verifyEmail = require('../middleware/verifyEmail');
const buyerController = require('../controllers/buyerController');

// All routes require authentication
router.use(auth);

/**
 * @route   POST /api/buyer/purchase/:websiteId
 * @desc    Purchase a free website (requires email verification)
 * @access  Private (Verified users only)
 */
router.post('/purchase/:websiteId', verifyEmail, buyerController.purchaseFreeWebsite);

/**
 * @route   GET /api/buyer/check-purchase/:websiteId
 * @desc    Check if user has purchased a website
 * @access  Private
 */
router.get('/check-purchase/:websiteId', buyerController.checkPurchase);

/**
 * @route   GET /api/buyer/my-purchases
 * @desc    Get buyer's purchase history
 * @access  Private
 */
router.get('/my-purchases', buyerController.getMyPurchases);

module.exports = router;