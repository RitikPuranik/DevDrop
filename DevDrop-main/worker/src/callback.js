const axios = require('axios');
const { buildHeaders } = require('../../backend/src/shared/utils/internalSignature');

// Worker -> Backend: POST /internal/webhooks/task-result (HMAC signed).
const sendTaskResult = async (task, status, extra = {}) => {
  const backendUrl = process.env.BACKEND_URL;
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!backendUrl || !secret) return;

  const body = JSON.stringify({ taskId: task.taskId, status, ...extra });
  await axios.post(`${backendUrl.replace(/\/+$/, '')}/internal/webhooks/task-result`, body, {
    headers: buildHeaders(secret, body),
    timeout: 10000,
    transformRequest: [(d) => d],
  });
};

module.exports = { sendTaskResult };


// Worker -> Backend: low-frequency progress event for long-running Kashi runs.
const sendTaskProgress = async (task, event) => {
  const backendUrl = process.env.BACKEND_URL;
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!backendUrl || !secret) return;

  const body = JSON.stringify({ taskId: task.taskId, runId: event?.runId, event });
  try {
    await axios.post(`${backendUrl.replace(/\/+$/, '')}/internal/webhooks/task-progress`, body, {
      headers: buildHeaders(secret, body),
      timeout: 5000,
      transformRequest: [(d) => d],
    });
  } catch (error) {
    // Progress delivery is best-effort. A temporary Backend outage must never
    // interrupt the long-running Kashi task in the Worker.
    console.warn(`⚠️  Kashi progress callback failed: ${error.message}`);
  }
};

module.exports.sendTaskProgress = sendTaskProgress;
