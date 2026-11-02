const queue = require('../../infrastructure/queue');
const { emitToJob } = require('../../shared/realtime/socket');
const entitlements = require('../billing/entitlement.service');

const { QUEUE_NAMES, JOB_TYPES, QueueJob, jobStore } = queue;

const lifecycle = () => require('../../services/ai-studio/aiStudioLifecycle.service');

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
  const job = await QueueJob.findOne({ jobKey: req.params.id, type: JOB_TYPES.AI_GENERATE }).select('+payload +checkpoint status mode tier userId');
  if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
  // Defense in depth: even a job that somehow reached the queue without passing the entitlement gate
  // (direct Redis/Mongo write, legacy path) is never served to ai-service without a live quota reservation.
  if (!(await entitlements.isJobAuthorized(req.params.id))) {
    console.warn('[billing] refused to serve payload for an unauthorized job', { jobKey: req.params.id });
    return res.status(403).json({ success: false, code: 'NOT_ENTITLED', message: 'Job is not authorized for AI generation.' });
  }
  if (QueueJob.TERMINAL.includes(job.status) || !job.payload) {
    return res.status(409).json({ success: false, status: job.status, message: `Job is ${job.status}` });
  }
  let payload = job.payload;
  let tier = job.tier || 'standard';
  // Defense in depth for the advanced pipeline: the entitlement is re-resolved from the database at the moment the worker
  // takes the job. A job that is not (or is no longer) entitled is served as a STANDARD job, whatever its payload says.
  if (payload?.tier === 'advanced' || tier === 'advanced') {
    let entitled = false;
    try {
      entitled = entitlements.advancedGenerationEnabled() && entitlements.hasEntitlement(await entitlements.resolveEntitlement(job.userId), entitlements.ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION);
    } catch (error) {
      console.warn('[billing] could not re-verify advanced entitlement; serving the standard pipeline', { jobKey: req.params.id, error: error.message });
    }
    if (!entitled) {
      console.warn('[billing] advanced job downgraded to the standard pipeline at pickup', { jobKey: req.params.id });
      const { advanced, ...rest } = payload || {};
      payload = { ...rest, tier: 'standard' };
      tier = 'standard';
    } else {
      tier = 'advanced';
    }
  }
  return res.status(200).json({ success: true, data: { status: job.status, mode: job.mode, tier, payload, checkpoint: tier === 'advanced' ? job.checkpoint || null : null } });
};

// Progress snapshots for the advanced pipeline are bounded: a checkpoint is a resume aid, not storage.
const MAX_CHECKPOINT_BYTES = Number.parseInt(process.env.AI_MAX_CHECKPOINT_BYTES || String(10 * 1024 * 1024), 10);

const mergeAgent = (meta, details) => {
  const agents = Array.isArray(meta?.agents) ? meta.agents : [];
  if (!details || !details.name) return { agents };
  return { ...(meta || {}), agents: agents.filter((a) => a.name !== details.name).concat(details) };
};

exports.receive = async (req, res) => {
  if (!serviceKeyOk(req)) return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });

  const { event, jobId } = req.body || {};
  const known = ['started', 'stage', 'delayed', 'retrying', 'checkpoint', 'completed', 'failed'];
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
      // Advanced jobs attach a live snapshot of real pipeline state (phases, pages, counters). Only an advanced job may carry it.
      const advanced = job.tier === 'advanced' && req.body.advanced && typeof req.body.advanced === 'object' ? req.body.advanced : null;
      await jobStore.markActive(jobId);
      const waiting = status === 'waiting_for_capacity';
      const nextMeta = mergeAgent(job.generationMeta, waiting ? null : details);
      if (advanced) nextMeta.advanced = advanced;
      else if (job.generationMeta?.advanced) nextMeta.advanced = job.generationMeta.advanced;
      await jobStore.markProgress(jobId, {
        currentStage: stage,
        stageStatus: status,
        generationMeta: nextMeta,
        statusMessage: waiting ? details?.message || 'Waiting for Gemini capacity' : null,
        waitingUntil: waiting ? details?.retryAt || null : null,
      });
      emitToJob(jobId, 'ai-job:stage', { jobId, stage, status, details: details || null, ...(advanced ? { advanced } : {}) });
    } else if (event === 'checkpoint') {
      const { checkpoint } = req.body;
      if (job.tier !== 'advanced' || !checkpoint || typeof checkpoint !== 'object') return res.status(200).json({ success: true, ignored: true });
      if (Buffer.byteLength(JSON.stringify(checkpoint)) > MAX_CHECKPOINT_BYTES) return res.status(200).json({ success: true, ignored: true, reason: 'checkpoint_too_large' });
      await QueueJob.updateOne({ jobKey: jobId, status: { $nin: QueueJob.TERMINAL } }, { $set: { checkpoint, checkpointAt: new Date() } });
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
        await entitlements.releaseJob(jobId, 'result_too_large');
        if (job.projectId) await lifecycle().finishJob({ projectId: job.projectId, userId: job.userId, jobKey: jobId, outcome: 'failed', message: 'The generated project is too large to store.' }).catch(() => {});
        emitToJob(jobId, 'ai-job:failed', { jobId, error: 'The generated project is too large to store.' });
      } else {
        // The worker reports agents only; keep the advanced summary (pages, quality report, repairs) the result carries.
        const finalMeta = job.tier === 'advanced' ? { ...(generationMeta || {}), advanced: result?.generationMeta?.advanced || job.generationMeta?.advanced || null } : generationMeta;
        await jobStore.markCompleted(jobId, { queue: QUEUE_NAMES.AI, result, generationMeta: finalMeta });
        await entitlements.commitJob(jobId); // completed => the reserved unit stays consumed
        // Saved to the project here (not by the browser) so it survives a closed or refreshed tab.
        if (job.projectId) {
          await lifecycle().finishJob({ projectId: job.projectId, userId: job.userId, jobKey: jobId, outcome: 'completed', result, mode: job.mode })
            .catch((e) => console.error('AI Studio could not save the generated project:', e.message));
        }
        emitToJob(jobId, 'ai-job:completed', { jobId, result, generationMeta: finalMeta });
      }
    } else if (event === 'failed') {
      const { error, failureClass, debugContext, errorType } = req.body;
      const message = String(error || 'AI generation failed').slice(0, 500);
      await jobStore.markFailed(jobId, { message, class: failureClass || 'permanent' }, { queue: QUEUE_NAMES.AI, debugContext, errorType: errorType === 'capacity_exhausted' ? 'capacity_exhausted' : 'failed' });
      await entitlements.releaseJob(jobId, 'failed'); // terminal failure => refunded (a debug retry re-takes it)
      if (job.projectId) await lifecycle().finishJob({ projectId: job.projectId, userId: job.userId, jobKey: jobId, outcome: 'failed', message }).catch(() => {});
      emitToJob(jobId, 'ai-job:failed', { jobId, error: message });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('AI webhook error:', error.message);
    // 5xx so the worker retries delivery of terminal events.
    return res.status(500).json({ success: false, message: 'Could not record job event.' });
  }
};
