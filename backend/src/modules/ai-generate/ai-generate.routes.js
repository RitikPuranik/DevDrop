const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const { aiJobPollingLimiter } = require('../../shared/middleware/rateLimit');
const aiGenerateController = require('./ai-generate.controller');
const aiWebhookController = require('./aiWebhook.controller');

// POST /api/ai-generate — requires a logged-in DevDrop user. Persists the job in MongoDB, enqueues it on
// the BullMQ `ai-queue` and returns a jobId immediately. The generation itself runs in the ai-service
// worker; progress arrives over the ai-job:<jobId> socket room instead of client polling.
router.post('/', auth, aiGenerateController.generate);

// GET /api/ai-generate/jobs/:id — status/result recovery (page refresh, reconnect, missed socket events).
// Served from MongoDB, so it keeps working across ai-service restarts.
router.post('/jobs/:id/debug-retry', auth, aiGenerateController.debugRetry);
router.get('/jobs/:id', auth, aiJobPollingLimiter, aiGenerateController.getJob);
router.delete('/jobs/:id', auth, aiGenerateController.cancel);

// Internal — called by the ai-service worker (service key, not user auth).
router.get('/internal/:id/payload', aiWebhookController.getPayload);
router.post('/webhook', aiWebhookController.receive);

module.exports = router;
