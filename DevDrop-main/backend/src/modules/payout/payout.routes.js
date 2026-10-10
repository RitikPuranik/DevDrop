const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const payoutController = require('./payout.controller');

router.get('/pending', auth, adminOnly, payoutController.getPendingPayouts);
router.get('/all', auth, adminOnly, payoutController.getAllPayouts);
router.get('/stats', auth, adminOnly, payoutController.getPayoutStats);
router.post('/:id/process', auth, adminOnly, payoutController.processPayout);
router.post('/:id/fail', auth, adminOnly, payoutController.failPayout);
router.get('/seller/:sellerId', auth, payoutController.getSellerPayouts);

module.exports = router;
