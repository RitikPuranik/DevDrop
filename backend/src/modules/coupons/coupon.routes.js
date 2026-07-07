const express = require('express');

const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const couponController = require('./coupon.controller');

const router = express.Router();

router.use(auth, adminOnly);

router.get('/', couponController.getCoupons);
router.post('/', couponController.createCoupon);
router.patch('/:id/toggle', couponController.toggleCoupon);

module.exports = router;
