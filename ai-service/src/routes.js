const express = require('express');
const axios = require('axios');
const { createJob, getJob } = require('./jobs.service');
const geminiPool = require('./geminiPool.service');
const GeminiApiKey = require('./models/geminiApiKey.model');

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

// Never send a raw Gemini key anywhere. The backend owns admin CRUD and
// serialization; ai-service only returns runtime/status information.
function maskKey(doc) {
  const prefix = doc.keyPrefix || 'AIza';
  const suffix = doc.keySuffix || '????';
  return `${prefix}...${suffix}`;
}

function isCoolingDown(doc) {
  return Boolean(doc.cooldownUntil && new Date(doc.cooldownUntil).getTime() > Date.now());
}

function serializeKey(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    label: obj.label,
    maskedKey: maskKey(obj),
    enabled: obj.enabled,
    priority: obj.priority,
    status: obj.status,
    cooldownUntil: obj.cooldownUntil,
    isCoolingDown: isCoolingDown(obj),
    failureCount: obj.failureCount,
    consecutiveFailures: obj.consecutiveFailures,
    totalRequests: obj.totalRequests,
    totalSuccesses: obj.totalSuccesses,
    totalFailures: obj.totalFailures,
    lastUsedAt: obj.lastUsedAt,
    lastSuccessAt: obj.lastSuccessAt,
    lastFailureAt: obj.lastFailureAt,
    lastErrorCode: obj.lastErrorCode,
    lastErrorMessage: obj.lastErrorMessage,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// A raw Gemini key never appears in a thrown error, a log line, or a
// response body anywhere in these routes — only encrypt()'s ciphertext
// output and the 4-char suffix used for masking are ever persisted, and
// only serializeKey()'s masked/metadata shape is ever returned.

// The backend owns admin CRUD and encryption. ai-service exposes only
// encrypted-key consumption/health endpoints and never accepts plaintext
// Gemini credentials from the backend.
router.post('/gemini-pool/reload', requireServiceKey, async (req, res) => {
  try {
    geminiPool.invalidate();
    await geminiPool.loadPool(true);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Gemini pool reload error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to reload Gemini pool.' });
  }
});

router.get('/gemini-pool/status', requireServiceKey, async (req, res) => {
  try {
    await geminiPool.loadPool();
    res.status(200).json({ success: true, data: geminiPool.getSnapshot() });
  } catch (error) {
    console.error('Gemini pool status error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load Gemini pool status.' });
  }
});

router.post('/gemini-pool/keys/:id/test', requireServiceKey, async (req, res) => {
  try {
    const doc = await GeminiApiKey.findById(req.params.id).select('+encryptedKey');
    if (!doc) return res.status(404).json({ success: false, message: 'Gemini key not found.' });

    const result = await geminiPool.testSingleKey(doc.encryptedKey, async (rawKey) => {
      const model = process.env.GEMINI_TEST_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      return axios.post(
        `${url}?key=${encodeURIComponent(rawKey)}`,
        {
          contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
          generationConfig: { maxOutputTokens: 8 },
        },
        { timeout: GEMINI_TEST_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const info = result?.classification || result;
    const update = {
      lastErrorCode: info?.classification === 'success' ? null : String(info?.status || info?.classification || 'unknown'),
      lastErrorMessage: info?.message || null,
      status: info?.classification === 'invalid' ? 'invalid' : info?.classification === 'rate_limit' ? 'rate_limited' : info?.classification === 'success' ? 'healthy' : 'degraded',
    };
    await GeminiApiKey.findByIdAndUpdate(doc._id, update);

    res.status(200).json({ success: true, data: { classification: info?.classification || 'unknown', message: info?.message || null } });
  } catch (error) {
    console.error('Gemini key test error:', error.message);
    res.status(200).json({ success: true, data: { classification: 'error', message: error.message } });
  }
});

module.exports = router;
