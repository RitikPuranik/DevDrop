const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const { aiGenerationLimiter } = require('../../shared/middleware/rateLimit');
const aiController = require('./ai.controller');
const { validatePortfolioGenerationRequest } = require('./ai.validators');
const { uploadAiAsset, handleUploadError } = require('./ai.upload');

// AI Studio requires an authenticated DevDrop user for every endpoint —
// there is no separate AI Studio login (Section 23).
router.use(auth);

router.post(
  '/generation/portfolio',
  aiGenerationLimiter,
  validatePortfolioGenerationRequest,
  aiController.createPortfolioGeneration
);

router.get('/generation/jobs/:jobId', aiController.getGenerationJobStatus);
router.get('/generation/jobs/:jobId/files', aiController.getGenerationJobFiles);
router.post('/generation/jobs/:jobId/retry', aiGenerationLimiter, aiController.retryGeneration);
router.post('/generation/jobs/:jobId/modify', aiGenerationLimiter, aiController.modifyGeneration);
router.get('/generation/jobs/:jobId/modify/:chatJobId', aiController.getModificationStatus);
router.post('/generation/jobs/:jobId/undo', aiController.undoLastChange);

router.post('/assets', uploadAiAsset, handleUploadError, aiController.uploadAsset);

module.exports = router;
