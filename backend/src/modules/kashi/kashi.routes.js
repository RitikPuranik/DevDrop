const express = require('express');
const router = express.Router();

const { auth, optionalAuth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { kashiChatLimiter, deployLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const controller = require('./kashi.controller');

// Chat works logged-out too (navigation / basic questions); optionalAuth only
// decides which pages Kashi is allowed to send the person to.
router.post('/chat', optionalAuth, kashiChatLimiter, controller.chat);

router.use(auth);
router.post('/deployments/:deploymentId/fix', validators.mongoId('deploymentId'), handleValidationErrors, verifyEmail, deployLimiter, controller.startFix);
router.get('/deployments/:deploymentId/fix-runs/latest', validators.mongoId('deploymentId'), handleValidationErrors, controller.getLatestForDeployment);
router.get('/fix-runs/:runId', validators.mongoId('runId'), handleValidationErrors, controller.getRun);
router.post('/fix-runs/:runId/cancel', validators.mongoId('runId'), handleValidationErrors, controller.cancelRun);

module.exports = router;
