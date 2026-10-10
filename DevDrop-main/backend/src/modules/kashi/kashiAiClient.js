const axios = require('axios');

function baseUrl() {
  const url = process.env.AI_SERVICE_URL;
  if (!url) {
    const err = new Error('AI_SERVICE_URL is not configured');
    err.userMessage = 'Kashi is not configured yet. Set AI_SERVICE_URL in backend/.env.';
    err.statusCode = 503;
    throw err;
  }
  return url.replace(/\/+$/, '');
}

const headers = () => ({ 'Content-Type': 'application/json', 'X-Service-Key': process.env.AI_SERVICE_TOKEN || '' });

async function post(path, body, timeout) {
  try {
    const res = await axios.post(`${baseUrl()}${path}`, body, { headers: headers(), timeout });
    return res.data?.data;
  } catch (error) {
    if (error.userMessage) throw error;
    const err = new Error(error.message);
    err.userMessage = error.response?.data?.message || 'Kashi is unavailable right now.';
    err.statusCode = error.response?.status || 502;
    throw err;
  }
}

/** Fast model: answers + navigation actions. */
const chat = ({ message, history, context }) => post('/kashi/chat', { message, history, context }, 30000);

/** Edit model: proposes a minimal fix for a failed build. */
const proposeFix = ({ errorLog, files, repoPaths, previousAttempts, mode }) =>
  post('/kashi/fix', { errorLog, files, repoPaths, previousAttempts, mode }, 120000);

/** Opens the deployed site in a headless browser; { ok, skipped?, errors, kind: 'env'|'code'|null, hint }. */
const runtimeCheck = (url) => post('/kashi/runtime-check', { url }, 90000);

module.exports = { chat, proposeFix, runtimeCheck };
