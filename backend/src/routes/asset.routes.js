const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { downloadLimiter } = require('../middleware/rateLimit');
const assetController = require('../controllers/assetController');

/**
 * @route   GET /api/assets/preview/:websiteId
 * @desc    Get public preview video URL
 * @access  Public
 */
router.get('/preview/:websiteId', assetController.getPreviewUrl);

/**
 * @route   GET /api/assets/website/:websiteId
 * @desc    Get signed URLs for purchased website files
 * @access  Private (Must have purchased)
 */
router.get('/website/:websiteId', auth, downloadLimiter, assetController.getAssetUrls);

/**
 * @route   GET /api/assets/download-history
 * @desc    Get user's download history
 * @access  Private
 */
router.get('/download-history', auth, assetController.getDownloadHistory);

module.exports = router;