const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const wishlistController = require('../controllers/wishlistController');

// All routes require authentication
router.use(auth);

/**
 * @route   POST /api/wishlist/:websiteId
 * @desc    Add website to wishlist
 * @access  Private
 */
router.post('/:websiteId', wishlistController.addToWishlist);

/**
 * @route   DELETE /api/wishlist/:websiteId
 * @desc    Remove from wishlist
 * @access  Private
 */
router.delete('/:websiteId', wishlistController.removeFromWishlist);

/**
 * @route   GET /api/wishlist
 * @desc    Get user's wishlist
 * @access  Private
 */
router.get('/', wishlistController.getWishlist);

/**
 * @route   GET /api/wishlist/check/:websiteId
 * @desc    Check if website is in wishlist
 * @access  Private
 */
router.get('/check/:websiteId', wishlistController.checkWishlist);

module.exports = router;