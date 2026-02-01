const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const websiteController = require('../controllers/websiteController');

/**
 * @route   GET /api/websites/search
 * @desc    Search websites
 * @access  Public
 */
router.get('/search', websiteController.searchWebsites);

/**
 * @route   GET /api/websites/category/:category
 * @desc    Get websites by category
 * @access  Public
 */
router.get('/category/:category', websiteController.getByCategory);

/**
 * @route   GET /api/websites
 * @desc    Browse all approved websites (public)
 * @access  Public (optionalAuth for wishlist status)
 */
router.get('/', optionalAuth, websiteController.browseWebsites);

/**
 * @route   GET /api/websites/:id
 * @desc    Get single website details
 * @access  Public (optionalAuth for wishlist status)
 */
router.get('/:id', optionalAuth, websiteController.getWebsiteDetails);

module.exports = router;