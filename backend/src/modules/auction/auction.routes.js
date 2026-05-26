const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const adminOnly = require('../../shared/middleware/adminOnly');
const auctionController = require('./auction.controller');

// Public
router.get('/', auctionController.getActiveAuctions);
router.get('/my/bids', auth, auctionController.getMyBids);  // auth-protected, before :websiteId
router.get('/:websiteId', auctionController.getAuction);

// Auth
router.post('/:websiteId/bid', auth, verifyEmail, auctionController.placeBid);

// Admin
router.post('/:websiteId/start', auth, adminOnly, auctionController.startAuction);
router.put('/:auctionId/end', auth, adminOnly, auctionController.endAuction);
router.post('/:auctionId/reopen', auth, adminOnly, auctionController.reopenAuction);

module.exports = router;