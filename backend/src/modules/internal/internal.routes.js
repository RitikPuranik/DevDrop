const express = require('express');
const { requireInternalSignature, captureRawBody } = require('../../shared/utils/internalSignature');
const realtime = require('../../shared/realtime/socket');
const KashiFixRun = require('../kashi/kashiFixRun.model');

const router = express.Router();

// Own JSON parser so the raw bytes are available for signature verification.
router.use(express.json({ limit: '1mb', verify: captureRawBody }));

// Worker -> Backend: live Kashi progress. The deployment-queue worker owns the long-running
// fix loop; the Backend only forwards its small progress events to Socket.IO.
// (Job status itself lives in MongoDB/BullMQ; there is no task-result callback any more.)
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
