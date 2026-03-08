const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const buyerController = require('./buyer.controller');

router.use(auth);
router.post('/purchase/:websiteId', verifyEmail, buyerController.purchaseFreeWebsite);
router.get('/check-purchase/:websiteId', buyerController.checkPurchase);
router.get('/my-purchases', buyerController.getMyPurchases);

module.exports = router;
