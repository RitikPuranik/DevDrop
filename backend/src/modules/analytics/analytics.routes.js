const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const analyticsController = require('./analytics.controller');

router.get('/platform', auth, adminOnly, analyticsController.getPlatformStats);
router.get('/websites', auth, adminOnly, analyticsController.getWebsiteStats);
router.get('/sales', auth, adminOnly, analyticsController.getSalesStats);
router.get('/getAll',auth, adminOnly, analyticsController.getAllUser)

module.exports = router;
