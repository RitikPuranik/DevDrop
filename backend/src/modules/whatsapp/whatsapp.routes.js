'use strict';

const express = require('express');
const controller = require('./whatsapp.controller');

// Mounted by admin.routes.js AFTER `router.use(auth, adminOnly)`, so every endpoint below is admin-only.
const router = express.Router();

router.get('/overview', controller.getOverview);
router.put('/settings', controller.updateSettings);

router.get('/report/stats', controller.getReportStats);
router.post('/report/preview', controller.previewReport);
router.post('/report/send', controller.sendLimiter, controller.sendReport);

router.get('/notifications', controller.listNotifications);
router.post('/notifications/:id/retry', controller.sendLimiter, controller.retryNotification);
router.post('/test', controller.sendLimiter, controller.sendTest);

module.exports = router;
