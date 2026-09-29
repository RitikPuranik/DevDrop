const express = require('express');
const { requireInternalSignature, captureRawBody } = require('../../shared/utils/internalSignature');
const registry = require('../../services/taskRegistry.service');

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

    console.log(`📬 Task ${taskId} (${task.type}) -> ${task.status}`);
    res.json({ success: true });
  }
);

module.exports = router;
