const axios = require('axios');
const { randomUUID } = require('crypto');
const { buildHeaders } = require('../shared/utils/internalSignature');
const registry = require('./taskRegistry.service');

/**
 * Sends a task to the Worker over the signed internal webhook.
 * The Worker acknowledges immediately (202) and runs the task asynchronously;
 * the outcome comes back on POST /internal/webhooks/task-result.
 */
const dispatchTask = async (type, payload = {}) => {
  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!workerUrl || !secret) {
    throw new Error('WORKER_URL and INTERNAL_WEBHOOK_SECRET must be configured to dispatch tasks');
  }

  const taskId = randomUUID();
  registry.create(taskId, type);

  const body = JSON.stringify({ taskId, type, payload });
  try {
    await axios.post(`${workerUrl.replace(/\/+$/, '')}/internal/webhooks/tasks`, body, {
      headers: buildHeaders(secret, body),
      timeout: 10000,
      transformRequest: [(d) => d], // keep the exact signed bytes
    });
  } catch (error) {
    registry.update(taskId, { status: 'failed', error: `Worker dispatch failed: ${error.message}` });
    throw new Error(`Worker dispatch failed: ${error.message}`);
  }
  console.log(`📤 Task ${taskId} (${type}) dispatched to worker`);
  return { taskId };
};

module.exports = { dispatchTask };
