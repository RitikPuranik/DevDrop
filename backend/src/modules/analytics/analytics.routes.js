const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const analyticsController = require('./analytics.controller');
const activityController = require('./activity.controller');

// Per-user buying/selling time heatmap (authenticated)
router.post('/activity/heartbeat', auth, activityController.heartbeat);
router.get('/activity/heatmap', auth, activityController.getHeatmap);

// Public (no auth)
router.get('/public-stats', analyticsController.getPublicStats);

router.get('/platform', auth, adminOnly, analyticsController.getPlatformStats);
router.get('/websites', auth, adminOnly, analyticsController.getWebsiteStats);
router.get('/sales', auth, adminOnly, analyticsController.getSalesStats);
router.get('/getAll',auth, adminOnly, analyticsController.getAllUser)

module.exports = router;
