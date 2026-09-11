const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const aiGenerateController = require('./ai-generate.controller');

// POST /api/ai-generate — requires a logged-in DevDrop user
router.post('/', auth, aiGenerateController.generate);

module.exports = router;
