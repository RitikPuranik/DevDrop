'use strict';

const axios = require('axios');

// ai-service -> backend. The backend owns the durable job record (MongoDB) and Socket.IO fan-out.
// BACKEND_WEBHOOK_URL (already configured) is .../api/ai-generate/webhook; the payload endpoint sits next to it.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function webhookUrl() {
  const url = process.env.BACKEND_WEBHOOK_URL;
  return url ? url.replace(/\/+$/, '') : null;
}
const apiBase = () => (webhookUrl() ? webhookUrl().replace(/\/webhook$/, '') : null);
const headers = () => ({ 'Content-Type': 'application/json', 'X-Service-Key': process.env.SERVICE_API_KEY || '' });

// The large job input lives in MongoDB (never Redis); the worker pulls it by job key.
async function fetchPayload(jobKey) {
  const base = apiBase();
  if (!base) throw Object.assign(new Error('BACKEND_WEBHOOK_URL is not configured'), { failureClass: 'permanent' });
  try {
    const response = await axios.get(`${base}/internal/${encodeURIComponent(jobKey)}/payload`, { headers: headers(), timeout: 30000, maxContentLength: Infinity });
    return response.data?.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 404 || status === 409) {
      // Job removed, cancelled or already finished: nothing to run, and nothing to retry.
      const err = new Error(`Job input unavailable (HTTP ${status}${error.response?.data?.status ? `, ${error.response.data.status}` : ''})`);
      err.skipJob = true;
      throw err;
    }
    if (status === 401 || status === 403) throw Object.assign(new Error('Backend rejected the service key'), { failureClass: 'permanent' });
    throw error; // network / 5xx -> transient
  }
}

// Best-effort progress event. Returns the backend's reply (it flags cancelled jobs) or null.
async function sendEvent(event, jobId, body = {}) {
  const url = webhookUrl();
  if (!url) return null;
  try {
    const response = await axios.post(url, { event, jobId, ...body }, { headers: headers(), timeout: 8000, maxBodyLength: Infinity });
    return response.data || null;
  } catch (error) {
    console.warn('[ai-service webhook] delivery failed', { event, jobId, message: error.message });
    return null;
  }
}

// Terminal events (completed/failed) must arrive: the backend is the only place the result is kept.
async function deliverTerminal(event, jobId, body = {}, { attempts = 4, baseDelayMs = 2000 } = {}) {
  const url = webhookUrl();
  if (!url) throw Object.assign(new Error('BACKEND_WEBHOOK_URL is not configured'), { failureClass: 'permanent' });
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await axios.post(url, { event, jobId, ...body }, { headers: headers(), timeout: 30000, maxBodyLength: Infinity });
      return response.data || {};
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status && status < 500 && status !== 429) break; // 4xx: retrying will not help
      await sleep(baseDelayMs * (2 ** i));
    }
  }
  const err = new Error(`Could not deliver ${event} event to backend: ${lastError?.message}`);
  err.code = 'RESULT_DELIVERY_FAILED';
  err.failureClass = 'transient';
  throw err;
}

module.exports = { fetchPayload, sendEvent, deliverTerminal };
