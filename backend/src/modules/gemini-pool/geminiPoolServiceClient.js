const axios = require('axios');

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
    const response = await axios.get(`${base}/gemini-pool/status`, { headers: headers(), timeout: 5000 });
    return response.data?.data || null;
  } catch (error) {
    console.warn('Gemini pool live status unavailable:', error.message);
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
