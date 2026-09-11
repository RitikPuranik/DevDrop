const express = require('express');
const axios = require('axios');
const { createJob, getJob } = require('./jobs.service');
const geminiPool = require('./geminiPool.service');

const router = express.Router();

const GEMINI_TEST_TIMEOUT_MS = 15000;

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

// GET /gemini-pool/status — live pool snapshot for the admin UI (via backend).
router.get('/gemini-pool/status', requireServiceKey, async (req, res) => {
  try {
    await geminiPool.loadPool();
    res.status(200).json({ success: true, data: geminiPool.getSnapshot() });
  } catch (error) {
    console.error('Gemini pool status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to read Gemini pool status.' });
  }
});

// POST /gemini-pool/reload — drop ai-service's short-TTL pool cache so an
// admin add/enable/disable/reorder/delete takes effect immediately instead
// of waiting out GEMINI_POOL_REFRESH_MS.
router.post('/gemini-pool/reload', requireServiceKey, async (req, res) => {
  geminiPool.invalidate();
  await geminiPool.loadPool(true);
  res.status(200).json({ success: true, data: geminiPool.getSnapshot() });
});

// POST /gemini-pool/test-key — lightweight single-key test, used by the
// admin "Test" button. Runs a minimal generateContent call directly (not
// through jobs.service/gemini.service) so it never touches the job queue
// or a full AI Studio generation, and never fails over to another key —
// the point is to test THIS key.
router.post('/gemini-pool/test-key', requireServiceKey, async (req, res) => {
  const { encryptedKey } = req.body || {};
  if (!encryptedKey) {
    return res.status(400).json({ success: false, message: 'encryptedKey is required.' });
  }

  const result = await geminiPool.testSingleKey(encryptedKey, (rawKey) => {
    const model = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite').trim() || 'gemini-3.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    return axios.post(
      `${url}?key=${encodeURIComponent(rawKey)}`,
      {
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
        generationConfig: { maxOutputTokens: 8 },
      },
      { timeout: GEMINI_TEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );
  });

  // Always 200 — a failed *test* isn't a failed *request*; the classification
  // in the body is what the admin UI needs.
  res.status(200).json({ success: true, data: result });
});

module.exports = router;
