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
