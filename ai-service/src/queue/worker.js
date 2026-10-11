'use strict';

const { Worker, DelayedError, UnrecoverableError } = require('bullmq');
const { createQueueRedisConnection } = require('./connection');
const { QUEUE_NAMES } = require('./names');
const { classifyError, FAILURE } = require('./errors');
const backend = require('./backendClient');
const { generateWebsite, debugWebsite } = require('../orchestrator/websiteGeneration.orchestrator');
const { editWebsite } = require('../orchestrator/websiteEditing.orchestrator');
const { runWithJob } = require('../utils/jobContext');

const int = (key, fallback, min = 0) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

const settings = () => ({
  concurrency: int('AI_QUEUE_CONCURRENCY', 1, 1),
  timeoutMs: int('AI_JOB_TIMEOUT_MS', 20 * 60 * 1000),
  // Gemini capacity is already waited out INSIDE a call (llm.service, GEMINI_CAPACITY_WAIT_MAX_MS) without
  // restarting the pipeline. Re-queueing restarts the whole pipeline, so extra queue-level delays default to 0.
  quotaMaxDelays: int('AI_QUOTA_MAX_DELAYS', 0),
  quotaMinDelayMs: int('AI_QUOTA_MIN_DELAY_MS', 30000),
  quotaMaxDelayMs: int('AI_QUOTA_MAX_DELAY_MS', 15 * 60 * 1000),
  stalledIntervalMs: int('QUEUE_STALLED_INTERVAL_MS', 60000),
  maxStalledCount: int('QUEUE_MAX_STALLED_COUNT', 1),
});

const withTimeout = (promise, ms) => {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`AI job exceeded ${Math.round(ms / 1000)}s`), { failureClass: FAILURE.PERMANENT, code: 'JOB_TIMEOUT' })), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const pickRunner = (mode) => (mode === 'debug' ? debugWebsite : mode === 'edit' ? editWebsite : generateWebsite);

// Quota exhaustion: wait for the provider cooldown (bounded) instead of retrying immediately.
const quotaDelayMs = (error, cfg, attemptIndex) => {
  const hinted = Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0 ? error.retryAfterMs : 0;
  const backoff = cfg.quotaMinDelayMs * (2 ** attemptIndex);
  return Math.min(cfg.quotaMaxDelayMs, Math.max(cfg.quotaMinDelayMs, hinted || backoff));
};

function createAiProcessor(overrides = {}) {
  const deps = { backend, pickRunner, ...overrides };

  return async function processAiJob(job, token) {
    const cfg = settings();
    const jobKey = job.data?.jobKey;
    if (!jobKey) throw new UnrecoverableError('AI job is missing jobKey');

    let input;
    try {
      input = await deps.backend.fetchPayload(jobKey);
    } catch (error) {
      if (error.skipJob) return { skipped: true, reason: error.message };
      throw error;
    }
    const payload = input.payload;
    const mode = payload.mode || input.mode || 'generate';

    await deps.backend.sendEvent('started', jobKey, { attempt: job.attemptsMade + 1 });

    const agents = [];
    let cancelled = false;
    let currentStage = 'starting';
    // Lets llm.service report "Waiting for Gemini capacity" for this job (same contract as before).
    // Unlike the old in-memory queue, the BullMQ worker slot stays held while waiting (concurrency is
    // bounded by AI_QUEUE_CONCURRENCY); the wait itself is bounded by GEMINI_CAPACITY_WAIT_MAX_MS.
    const jobContext = {
      jobId: jobKey,
      isCancelled: () => cancelled,
      onCapacityWait: async (info) => {
        if (cancelled) return null;
        await deps.backend.sendEvent('stage', jobKey, {
          stage: currentStage,
          status: 'waiting_for_capacity',
          details: { message: info.message, retryAt: info.retryAt, reason: info.reason },
        });
        return async () => {
          if (cancelled) return;
          await deps.backend.sendEvent('stage', jobKey, { stage: currentStage, status: 'processing', details: null });
        };
      },
    };
    const onStage = (stage, status, details) => {
      if (cancelled) throw Object.assign(new Error('Job cancelled'), { cancelled: true });
      currentStage = stage;
      if (details) {
        const i = agents.findIndex((a) => a.name === stage);
        if (i >= 0) agents.splice(i, 1);
        agents.push(details);
      }
      job.updateProgress({ stage, status }).catch(() => {});
      // Fire-and-forget: a slow webhook must never stall generation. The reply flags cancellation.
      Promise.resolve(deps.backend.sendEvent('stage', jobKey, { stage, status, details: details || null }))
        .then((reply) => { if (reply?.cancelled) cancelled = true; })
        .catch(() => {});
    };

    try {
      const run = deps.pickRunner(mode);
      const result = await withTimeout(runWithJob(jobContext, () => run(payload, { onStage })), cfg.timeoutMs);
      await deps.backend.deliverTerminal('completed', jobKey, { result, generationMeta: { agents } });
      return { ok: true };
    } catch (error) {
      if (error.cancelled || cancelled) return { cancelled: true };
      if (error.code === 'RESULT_DELIVERY_FAILED') throw error; // transient: BullMQ retries

      const klass = classifyError(error);
      if (klass === FAILURE.QUOTA) {
        const delays = job.data.quotaDelays || 0;
        if (delays < cfg.quotaMaxDelays) {
          const delayMs = quotaDelayMs(error, cfg, delays);
          await job.updateData({ ...job.data, quotaDelays: delays + 1 });
          await deps.backend.sendEvent('delayed', jobKey, { quotaDelays: delays + 1, retryAt: new Date(Date.now() + delayMs).toISOString() });
          await job.moveToDelayed(Date.now() + delayMs, token);
          throw new DelayedError();
        }
        // Capacity stayed exhausted (after the in-call wait and every allowed delay): stop and tell the user.
        const exhausted = new UnrecoverableError(error.userMessage || 'AI providers are over capacity right now. Please try again later.');
        exhausted.userMessage = exhausted.message;
        // Keep "Gemini had no capacity" distinguishable from a real generation failure.
        exhausted.errorType = 'capacity_exhausted';
        exhausted.failureClass = FAILURE.QUOTA;
        exhausted.debugContext = error.debugContext || null;
        throw exhausted;
      }
      if (klass === FAILURE.TRANSIENT) {
        error.failureClass = FAILURE.TRANSIENT;
        throw error; // bounded retry with exponential backoff (job opts)
      }
      // Permanent (validation/build failures, bad input): never retried; keep the debug context for debug-retry.
      const permanent = new UnrecoverableError(error.userMessage || error.message || 'AI generation failed');
      permanent.userMessage = error.userMessage || error.message;
      permanent.failureClass = FAILURE.PERMANENT;
      permanent.debugContext = error.debugContext || null;
      throw permanent;
    }
  };
}

function createAiWorker({ connection, processor } = {}) {
  const cfg = settings();
  const conn = connection || createQueueRedisConnection('ai-worker');
  const worker = new Worker(QUEUE_NAMES.AI, processor || createAiProcessor(), {
    connection: conn,
    concurrency: cfg.concurrency,
    stalledInterval: cfg.stalledIntervalMs,
    maxStalledCount: cfg.maxStalledCount,
    lockDuration: 60000,
  });

  worker.on('failed', async (job, error) => {
    try {
      const jobKey = job?.data?.jobKey;
      if (!jobKey) return;
      const stalled = /stalled/i.test(String(error?.message));
      const unrecoverable = error instanceof UnrecoverableError;
      const final = stalled || unrecoverable || job.attemptsMade >= (job.opts?.attempts || 1);
      const message = error.userMessage || error.message || 'AI generation failed';
      console.warn(`[ai-queue] job ${jobKey} attempt ${job.attemptsMade}/${job.opts?.attempts || 1} failed: ${String(message).slice(0, 200)}`);
      if (final) {
        await backend.deliverTerminal('failed', jobKey, {
          error: stalled ? 'The generation worker was interrupted and could not resume.' : message,
          failureClass: error.failureClass || classifyError(error),
          errorType: error.errorType || 'failed',
          debugContext: error.debugContext || undefined,
        }).catch((e) => console.error(`[ai-queue] could not report failure for ${jobKey}: ${e.message}`));
      } else {
        await backend.sendEvent('retrying', jobKey, { error: String(message).slice(0, 300) });
      }
    } catch (e) {
      console.error(`[ai-queue] failed-handler error: ${e.message}`);
    }
  });
  worker.on('error', (error) => console.error(`[ai-queue] worker error: ${error.code || error.message}`));
  return worker;
}

module.exports = { createAiWorker, createAiProcessor, settings };
