const axios = require('axios');

// Pushes job progress to the backend instead of making it poll us.
// Fire-and-forget by design: a dropped webhook must never fail or stall
// the generation job itself. The backend's own /jobs/:id GET (still present
// in routes.js) remains as a fallback the backend can use to resync a job's
// state if it ever misses events (reconnect, restart, etc).

function backendWebhookUrl() {
  const url = process.env.BACKEND_WEBHOOK_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

async function sendWebhook(event, jobId, payload) {
  const url = backendWebhookUrl();
  if (!url) return; // not configured — silently no-op, polling fallback still works
  try {
    await axios.post(url, { event, jobId, ...payload }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.SERVICE_API_KEY || '',
      },
      timeout: 5000,
    });
  } catch (error) {
    // Never throw from here — the generation pipeline keeps running even
    // if the backend is briefly unreachable. Backend can still poll
    // GET /jobs/:id as a fallback for this one job.
    console.warn('[ai-service webhook] delivery failed', { event, jobId, message: error.message });
  }
}

// One event per agent stage transition (started/completed/failed).
function notifyStage(jobId, stage, status, details) {
  return sendWebhook('stage', jobId, { stage, status, details: details || null });
}

// One event when the whole job finishes (success or failure).
function notifyComplete(jobId, job) {
  if (job.status === 'failed') {
    return sendWebhook('failed', jobId, { error: job.error });
  }
  return sendWebhook('completed', jobId, {
    result: job.result,
    generationMeta: job.generationMeta,
  });
}

module.exports = { notifyStage, notifyComplete };
