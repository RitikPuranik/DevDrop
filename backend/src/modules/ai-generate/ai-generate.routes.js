const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const { aiJobPollingLimiter } = require('../../shared/middleware/rateLimit');
const aiGenerateController = require('./ai-generate.controller');

// POST /api/ai-generate — requires a logged-in DevDrop user. Returns a
// jobId immediately; the actual Gemini generation runs in ai-service.
router.post('/', auth, aiGenerateController.generate);

// GET /api/ai-generate/jobs/:id — poll job status/result.
router.get('/jobs/:id', auth, aiJobPollingLimiter, aiGenerateController.getJob);

module.exports = router;
