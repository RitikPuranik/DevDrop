const express = require('express');
const { requireInternalSignature, captureRawBody } = require('../../shared/utils/internalSignature');
const registry = require('../../services/taskRegistry.service');
const realtime = require('../../shared/realtime/socket');
const KashiFixRun = require('../kashi/kashiFixRun.model');

const router = express.Router();

// Own JSON parser so the raw bytes are available for signature verification.
router.use(express.json({ limit: '1mb', verify: captureRawBody }));

// Worker -> Backend: task progress / result callback.
router.post(
  '/task-result',
  requireInternalSignature(() => process.env.INTERNAL_WEBHOOK_SECRET),
  (req, res) => {
    const { taskId, status, result, error } = req.body || {};
    if (typeof taskId !== 'string' || !registry.TASK_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'taskId and a valid status are required' });
    }

    const task = registry.update(taskId, { status, result, error });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Unknown task' });
    }

    if (task.type === 'KASHI_FIX' && status === 'failed' && task.payload?.runId) {
      realtime.emitToKashiRun(task.payload.runId, 'kashi-fix:status', {
        runId: task.payload.runId,
        status: 'failed',
        resultMessage: error || 'Kashi Worker task failed.',
        finishedAt: new Date().toISOString(),
      });
    }

    console.log(`📬 Task ${taskId} (${task.type}) -> ${task.status}`);
    res.json({ success: true });
  }
);

// Worker -> Backend: live Kashi progress. The Worker owns the long-running
// fix loop; the Backend only persists/forwards its small progress events.
router.post(
  '/task-progress',
  requireInternalSignature(() => process.env.INTERNAL_WEBHOOK_SECRET),
  async (req, res) => {
    const { taskId, runId, event } = req.body || {};
    if (typeof taskId !== 'string' || typeof runId !== 'string' || !event || typeof event !== 'object') {
      return res.status(400).json({ success: false, message: 'taskId, runId and event are required for a Kashi task' });
    }
    const run = await KashiFixRun.exists({ _id: runId });
    if (!run) return res.status(404).json({ success: false, message: 'Unknown Kashi run' });

    if (event.type === 'step' && event.step) {
      realtime.emitToKashiRun(runId, 'kashi-fix:step', { runId, step: event.step });
    } else if (event.type === 'status' && typeof event.status === 'string') {
      realtime.emitToKashiRun(runId, 'kashi-fix:status', { runId, ...event });
    }

    res.json({ success: true });
  }
);

module.exports = router;
