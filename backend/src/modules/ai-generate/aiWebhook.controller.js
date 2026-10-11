const queue = require('../../infrastructure/queue');
const { emitToJob } = require('../../shared/realtime/socket');

const { QUEUE_NAMES, JOB_TYPES, QueueJob, jobStore } = queue;

const MAX_RESULT_BYTES = Number.parseInt(process.env.AI_MAX_RESULT_BYTES || String(12 * 1024 * 1024), 10);

/**
 * ai-service (the ai-queue BullMQ worker) talks back to the backend through two service-key
 * protected endpoints. The backend owns the durable job record in MongoDB and the Socket.IO fan-out:
 *   GET  /api/ai-generate/internal/:id/payload   worker fetches the (large) job input
 *   POST /api/ai-generate/webhook                worker reports started/stage/delayed/retrying/completed/failed
 * Secured with the shared secret the backend already sends to ai-service as X-Service-Key
 * (AI_SERVICE_TOKEN here must match SERVICE_API_KEY there).
 */
const serviceKeyOk = (req) => {
  const provided = req.header('X-Service-Key');
  const expected = process.env.AI_SERVICE_TOKEN;
  return Boolean(expected && provided && provided === expected);
};

exports.getPayload = async (req, res) => {
  if (!serviceKeyOk(req)) return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });
  const job = await QueueJob.findOne({ jobKey: req.params.id, type: JOB_TYPES.AI_GENERATE }).select('+payload status mode');
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  if (QueueJob.TERMINAL.includes(job.status) || !job.payload) {
    return res.status(409).json({ success: false, status: job.status, message: `Job is ${job.status}` });
  }
  return res.status(200).json({ success: true, data: { status: job.status, mode: job.mode, payload: job.payload } });
};

const mergeAgent = (meta, details) => {
  const agents = Array.isArray(meta?.agents) ? meta.agents : [];
  if (!details || !details.name) return { agents };
  return { ...(meta || {}), agents: agents.filter((a) => a.name !== details.name).concat(details) };
};

exports.receive = async (req, res) => {
  if (!serviceKeyOk(req)) return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });

  const { event, jobId } = req.body || {};
  const known = ['started', 'stage', 'delayed', 'retrying', 'completed', 'failed'];
  if (!jobId || !known.includes(event)) return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });

  try {
    const job = await QueueJob.findOne({ jobKey: jobId, type: JOB_TYPES.AI_GENERATE });
    if (!job) return res.status(404).json({ success: false, message: 'Unknown job' });
    // A cancelled job tells the worker to stop at its next stage boundary.
    if (job.status === 'cancelled') return res.status(200).json({ success: true, cancelled: true });
    if (QueueJob.TERMINAL.includes(job.status)) return res.status(200).json({ success: true, ignored: true });

    if (event === 'started') {
      await jobStore.markActive(jobId, { attemptsMade: Number(req.body.attempt) || job.attemptsMade + 1 });
    } else if (event === 'stage') {
      const { stage, status, details } = req.body;
      await jobStore.markActive(jobId);
      const waiting = status === 'waiting_for_capacity';
      await jobStore.markProgress(jobId, {
        currentStage: stage,
        stageStatus: status,
        generationMeta: mergeAgent(job.generationMeta, waiting ? null : details),
        statusMessage: waiting ? details?.message || 'Waiting for Gemini capacity' : null,
        waitingUntil: waiting ? details?.retryAt || null : null,
      });
      emitToJob(jobId, 'ai-job:stage', { jobId, stage, status, details: details || null });
    } else if (event === 'delayed') {
      // Provider quota exhausted: the job waits (no attempt consumed) instead of hammering the pool.
      await jobStore.markDelayed(jobId, { quotaDelays: Number(req.body.quotaDelays) || job.quotaDelays + 1 });
      await jobStore.markProgress(jobId, { status: 'delayed', currentStage: 'waiting-for-quota', stageStatus: 'queued' });
      emitToJob(jobId, 'ai-job:stage', { jobId, stage: 'waiting-for-quota', status: 'queued', details: { retryAt: req.body.retryAt || null } });
    } else if (event === 'retrying') {
      await jobStore.markProgress(jobId, { status: 'queued', currentStage: 'queued', stageStatus: 'queued', error: { message: String(req.body.error || '').slice(0, 300), class: 'transient' } });
      emitToJob(jobId, 'ai-job:stage', { jobId, stage: 'retrying', status: 'queued', details: null });
    } else if (event === 'completed') {
      const { result, generationMeta } = req.body;
      if (Buffer.byteLength(JSON.stringify(result ?? null)) > MAX_RESULT_BYTES) {
        await jobStore.markFailed(jobId, { code: 'RESULT_TOO_LARGE', message: 'The generated project is too large to store.', class: 'permanent' }, { queue: QUEUE_NAMES.AI });
        emitToJob(jobId, 'ai-job:failed', { jobId, error: 'The generated project is too large to store.' });
      } else {
        await jobStore.markCompleted(jobId, { queue: QUEUE_NAMES.AI, result, generationMeta });
        emitToJob(jobId, 'ai-job:completed', { jobId, result, generationMeta });
      }
    } else if (event === 'failed') {
      const { error, failureClass, debugContext, errorType } = req.body;
      const message = String(error || 'AI generation failed').slice(0, 500);
      await jobStore.markFailed(jobId, { message, class: failureClass || 'permanent' }, { queue: QUEUE_NAMES.AI, debugContext, errorType: errorType === 'capacity_exhausted' ? 'capacity_exhausted' : 'failed' });
      emitToJob(jobId, 'ai-job:failed', { jobId, error: message });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('AI webhook error:', error.message);
    // 5xx so the worker retries delivery of terminal events.
    return res.status(500).json({ success: false, message: 'Could not record job event.' });
  }
};
