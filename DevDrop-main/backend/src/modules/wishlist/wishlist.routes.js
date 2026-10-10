const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const wishlistController = require('./wishlist.controller');

router.use(auth);
router.get('/', wishlistController.getWishlist);
router.get('/check/:websiteId', wishlistController.checkWishlist);
router.post('/:websiteId', wishlistController.addToWishlist);
router.delete('/:websiteId', wishlistController.removeFromWishlist);

module.exports = router;
