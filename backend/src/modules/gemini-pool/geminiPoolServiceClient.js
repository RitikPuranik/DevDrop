const axios = require('axios');

/**
 * Thin client for ai-service's internal Gemini-pool routes — mirrors
 * ai-generate/aiServiceClient.js's shape/conventions (same shared-secret
 * auth via X-Service-Key, same AI_SERVICE_URL).
 *
 * This backend owns the pool's persisted config (Mongo CRUD, encryption);
 * ai-service owns live runtime state (in-flight requests, in-memory
 * cooldown timers) because that's the process actually calling Gemini.
 * These calls let the admin UI see ai-service's live numbers, and let a
 * CRUD change take effect immediately instead of waiting for ai-service's
 * own short TTL cache to expire.
 */

function baseUrl() {
  const url = process.env.AI_SERVICE_URL;
  if (!url) return null;
  return url.replace(/\/+$/, '');
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Service-Key': process.env.AI_SERVICE_TOKEN || '',
  };
}

/**
 * Live runtime snapshot from ai-service: active/queued requests, configured
 * concurrency, and per-key in-memory state (cooldowns etc). Returns null if
 * ai-service is unreachable/unconfigured rather than throwing — pool status
 * should still show the DB-backed config even if ai-service is down.
 */
async function getLiveStatus() {
  const base = baseUrl();
  if (!base) return null;
  try {
    const response = await axios.get(`${base}/gemini-pool/status`, {
      headers: headers(),
      timeout: 5000,
    });
    return response.data?.data || null;
  } catch (error) {
    console.warn('Gemini pool live status unavailable:', error.message);
    return null;
  }
}

/**
 * Tells ai-service to drop its cached pool config immediately so an admin
 * add/enable/disable/reorder/delete is picked up before the next request
 * rather than waiting out the TTL. Best-effort — ai-service will still
 * self-heal from Mongo on its own poll interval if this fails.
 */
async function reloadPool() {
  const base = baseUrl();
  if (!base) return false;
  try {
    await axios.post(`${base}/gemini-pool/reload`, {}, { headers: headers(), timeout: 5000 });
    return true;
  } catch (error) {
    console.warn('Gemini pool reload notification failed:', error.message);
    return false;
  }
}

/**
 * Asks ai-service to run a lightweight test request against one key. Kept
 * in ai-service (not this backend) so the actual Gemini call, failure
 * classification, and status update all go through the same code path
 * generation does.
 */
async function testKey({ id, encryptedKey }) {
  const base = baseUrl();
  if (!base) {
    const err = new Error('AI_SERVICE_URL is not configured');
    err.userMessage = 'ai-service is not configured yet. Set AI_SERVICE_URL in backend/.env.';
    err.statusCode = 500;
    throw err;
  }
  try {
    const response = await axios.post(
      `${base}/gemini-pool/test-key`,
      { id, encryptedKey },
      { headers: headers(), timeout: 20000 }
    );
    return response.data?.data || null;
  } catch (error) {
    if (error.userMessage) throw error;
    const err = new Error(error.message);
    err.userMessage = error.response?.data?.message || 'Failed to test the Gemini key.';
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

module.exports = { getLiveStatus, reloadPool, testKey };
