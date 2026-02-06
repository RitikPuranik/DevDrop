const express = require('express');
const router = express.Router();
const biddingController = require('../controllers/biddingController');
const { auth } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const verifyEmail = require('../middleware/verifyEmail');

/**
 * Public routes
 */

// Get all active auctions
router.get('/active', biddingController.getActiveAuctions);

// Get specific auction details
router.get('/:websiteId', biddingController.getAuction);

/**
 * Private routes (logged in users)
 */

// Place bid on auction
router.post(
  '/:websiteId/bid',
  auth,
  verifyEmail,
  biddingController.placeBid
);

// Get my bid history
router.get(
  '/my/bids',
  auth,
  biddingController.getMyBids
);

/**
 * Admin routes
 */

// Start auction for exclusive website
router.post(
  '/:websiteId/start',
  auth,
  adminOnly,
  biddingController.startAuction
);

// Manually end auction
router.post(
  '/:auctionId/end',
  auth,
  adminOnly,
  biddingController.endAuction
);

// Reopen auction (if winner didn't pay)
router.post(
  '/:auctionId/reopen',
  auth,
  adminOnly,
  biddingController.reopenAuction
);

module.exports = router;