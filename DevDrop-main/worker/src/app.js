const express = require('express');
const { requireInternalSignature, captureRawBody } = require('../../backend/src/shared/utils/internalSignature');

// Builds the Worker HTTP app. `runner` is injected so tests can stub it.
const createApp = ({ runner }) => {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Worker is running', timestamp: new Date().toISOString(), ...runner.stats() });
  });

  // Backend -> Worker: acknowledge immediately, run asynchronously.
  app.post(
    '/internal/webhooks/tasks',
    express.json({ limit: '1mb', verify: captureRawBody }),
    requireInternalSignature(() => process.env.INTERNAL_WEBHOOK_SECRET),
    (req, res) => {
      const { taskId, type, payload } = req.body || {};
      if (typeof taskId !== 'string' || !taskId || typeof type !== 'string' || !type) {
        return res.status(400).json({ success: false, message: 'taskId and type are required' });
      }

      const outcome = runner.enqueue({ taskId, type, payload: payload || {} });
      if (outcome.accepted) {
        return res.status(202).json({ success: true, taskId, status: 'queued' });
      }
      const statusByReason = { unknown_type: 400, queue_full: 429, shutting_down: 503 };
      return res.status(statusByReason[outcome.reason] || 400).json({ success: false, message: outcome.reason });
    }
  );

  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status === 400 ? 400 : 500).json({ success: false, message: 'Request failed' });
  });

  return app;
};

module.exports = { createApp };
