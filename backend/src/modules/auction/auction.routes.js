const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const adminOnly = require('../../shared/middleware/adminOnly');
const auctionController = require('./auction.controller');

router.get('/', auctionController.getActiveAuctions);
router.get('/:id', auctionController.getAuction);
router.post('/:id/bid', auth, verifyEmail, auctionController.placeBid);
router.get('/:id/bids', auctionController.getMyBids);
router.post('/', auth, adminOnly, auctionController.startAuction);
router.put('/:id/end', auth, adminOnly, auctionController.endAuction);

module.exports = router;