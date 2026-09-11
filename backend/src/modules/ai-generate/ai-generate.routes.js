const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const aiGenerateController = require('./ai-generate.controller');

// POST /api/ai-generate — queues work in the standalone ai-service.
router.post('/', auth, aiGenerateController.generate);

// GET /api/ai-generate/jobs/:id — fetch async generation status/result.
router.get('/jobs/:id', auth, aiGenerateController.getJob);

module.exports = router;
