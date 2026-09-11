const express = require('express');
const { createJob, getJob } = require('./jobs.service');

const router = express.Router();

/**
 * Shared-secret auth between DevDrop's main backend and this service.
 * Only the backend should ever be able to reach these routes.
 */
function requireServiceKey(req, res, next) {
  const expected = process.env.SERVICE_API_KEY;
  const provided = req.header('X-Service-Key');

  if (!expected) {
    // Fail closed rather than silently accepting every request when
    // misconfigured.
    return res.status(500).json({ success: false, message: 'ai-service is not configured (SERVICE_API_KEY missing).' });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });
  }

  next();
}

// GET /health — unauthenticated, for local/process health checks.
router.get('/health', (req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
});

// POST /jobs — enqueue a new AI generation job. Returns immediately.
router.post('/jobs', requireServiceKey, (req, res) => {
  const { messages, fileData } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'No messages provided' });
  }

  const jobId = createJob({ messages, fileData: fileData || null });

  res.status(202).json({
    success: true,
    data: { jobId, status: 'queued' },
  });
});

// GET /jobs/:id — poll job status/result.
router.get('/jobs/:id', requireServiceKey, (req, res) => {
  const job = getJob(req.params.id);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }

  if (job.status === 'completed') {
    return res.status(200).json({
      success: true,
      data: { jobId: job.id, status: 'completed', result: job.result },
    });
  }

  if (job.status === 'failed') {
    return res.status(200).json({
      success: true,
      data: { jobId: job.id, status: 'failed', error: job.error },
    });
  }

  // 'queued' or 'processing'
  return res.status(200).json({
    success: true,
    data: { jobId: job.id, status: job.status },
  });
});

module.exports = router;
