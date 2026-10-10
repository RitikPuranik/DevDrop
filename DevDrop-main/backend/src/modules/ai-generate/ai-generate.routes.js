const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const { aiJobPollingLimiter } = require('../../shared/middleware/rateLimit');
const aiGenerateController = require('./ai-generate.controller');
const aiWebhookController = require('./aiWebhook.controller');

// POST /api/ai-generate — requires a logged-in DevDrop user. Returns a
// jobId immediately; the actual Gemini generation runs in ai-service, and
// progress arrives over the ai-job:<jobId> socket room (see socket.js /
// aiWebhook.controller.js) instead of the client polling for it.
router.post('/', auth, aiGenerateController.generate);

// GET /api/ai-generate/jobs/:id — resync fallback only (page refresh,
// missed socket events, socket.io unreachable). Not meant to be polled on
// an interval anymore — the frontend now listens on sockets for updates.
router.post('/jobs/:id/debug-retry', auth, aiGenerateController.debugRetry);
router.get('/jobs/:id', auth, aiJobPollingLimiter, aiGenerateController.getJob);

// POST /api/ai-generate/webhook — internal, called by ai-service (not by
// browsers). Secured by shared secret, not user auth — see controller.
router.post('/webhook', aiWebhookController.receive);

module.exports = router;
