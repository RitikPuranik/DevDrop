const axios = require('axios');
const http = require('http');
const https = require('https');

// Admin polling should not depend on a potentially stale keep-alive socket.
// A fresh socket plus a small retry budget prevents transient ECONNRESETs from
// making the admin dashboard fall back to stale DB-only values.
const HTTP_AGENT = new http.Agent({ keepAlive: false });
const HTTPS_AGENT = new https.Agent({ keepAlive: false });

const transientSocketCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED']);

function isTransientStatusError(error) {
  const status = error?.response?.status;
  return transientSocketCodes.has(error?.code) || status === 502 || status === 503 || status === 504;
}

async function getWithRetry(url, config = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await axios.get(url, {
        ...config,
        httpAgent: HTTP_AGENT,
        httpsAgent: HTTPS_AGENT,
        timeout: config.timeout ?? 8000,
      });
    } catch (error) {
      lastError = error;
      if (!isTransientStatusError(error) || attempt === attempts - 1) throw error;
      const waitMs = 250 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function baseUrl() {
  const url = process.env.AI_SERVICE_URL;
  return url ? url.replace(/\/+$/, '') : null;
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Service-Key': process.env.AI_SERVICE_TOKEN || '',
  };
}

function notConfiguredError() {
  const err = new Error('AI_SERVICE_URL is not configured');
  err.userMessage = 'ai-service is not configured yet. Set AI_SERVICE_URL in backend/.env.';
  err.statusCode = 500;
  return err;
}

function wrapError(error, fallbackMessage) {
  if (error.userMessage) return error;
  const err = new Error(error.message);
  err.userMessage = error.response?.data?.message || fallbackMessage;
  err.statusCode = error.response?.status || 502;
  return err;
}

async function call(method, path, data, timeout = 10000) {
  const base = baseUrl();
  if (!base) throw notConfiguredError();
  try {
    const response = await axios({ method, url: `${base}${path}`, data, headers: headers(), timeout });
    return response.data;
  } catch (error) {
    throw wrapError(error, 'Gemini ai-service request failed.');
  }
}

async function testKey(id) {
  const body = await call('post', `/gemini-pool/keys/${id}/test`, {}, 20000);
  return body?.data || null;
}

async function getLiveStatus() {
  const base = baseUrl();
  if (!base) return null;
  try {
    const response = await getWithRetry(
      `${base}/gemini-pool/status`,
      { headers: { ...headers(), 'Cache-Control': 'no-cache', Connection: 'close' }, timeout: 8000 },
      3
    );
    return response.data?.data || null;
  } catch (error) {
    console.warn('Gemini pool live status unavailable after retries:', {
      code: error?.code || null,
      status: error?.response?.status || null,
      message: error.message,
    });
    return null;
  }
}

async function reloadPool() {
  const base = baseUrl();
  if (!base) return false;
  try {
    await axios.post(`${base}/gemini-pool/reload`, {}, { headers: headers(), timeout: 5000 });
    return true;
  } catch (error) {
    console.warn('Gemini pool reload unavailable:', error.message);
    return false;
  }
}

module.exports = { testKey, getLiveStatus, reloadPool };
