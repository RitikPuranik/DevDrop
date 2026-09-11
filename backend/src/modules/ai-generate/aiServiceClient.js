const axios = require('axios');

/**
 * Thin client for the dedicated ai-service (AI Studio's Gemini generation,
 * moved out of this backend). Talks to ai-service over HTTP using a
 * shared secret (X-Service-Key), configured via AI_SERVICE_URL /
 * AI_SERVICE_TOKEN in backend/.env.
 */

function baseUrl() {
  const url = process.env.AI_SERVICE_URL;
  if (!url) {
    const err = new Error('AI_SERVICE_URL is not configured');
    err.userMessage = 'AI Studio is not configured yet. Set AI_SERVICE_URL in backend/.env and restart.';
    err.statusCode = 500;
    throw err;
  }
  return url.replace(/\/+$/, '');
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'X-Service-Key': process.env.AI_SERVICE_TOKEN || '',
  };
}

/**
 * Creates a job on ai-service. Returns the jobId. The backend does not
 * wait for generation to finish — ai-service returns 202 immediately.
 */
async function createJob({ messages, fileData }) {
  try {
    const response = await axios.post(
      `${baseUrl()}/jobs`,
      { messages, fileData: fileData || null },
      { headers: headers(), timeout: 10000 }
    );
    return response.data?.data?.jobId;
  } catch (error) {
    if (error.userMessage) throw error;
    const err = new Error(error.message);
    err.userMessage = error.response?.data?.message || 'Failed to start AI generation.';
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

/**
 * Fetches job status/result from ai-service.
 */
async function getJob(jobId) {
  try {
    const response = await axios.get(`${baseUrl()}/jobs/${encodeURIComponent(jobId)}`, {
      headers: headers(),
      timeout: 10000,
    });
    return response.data?.data || null;
  } catch (error) {
    if (error.response?.status === 404) return null;
    if (error.userMessage) throw error;
    const err = new Error(error.message);
    err.userMessage = error.response?.data?.message || 'Failed to check AI generation status.';
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

module.exports = { createJob, getJob };
