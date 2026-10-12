'use strict';

const { Worker, DelayedError, UnrecoverableError } = require('bullmq');
const { createQueueRedisConnection } = require('./connection');
const { QUEUE_NAMES, AI_CANCEL_CHANNEL } = require('./names');
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

// Jobs running in this process, so a cancel pushed by the backend can stop one immediately
// (no polling: the backend publishes on a Redis channel when the user presses Stop).
const runningJobs = new Map(); // jobKey -> () => void

function cancelRunningJob(jobKey) {
  const stop = runningJobs.get(jobKey);
  if (!stop) return false;
  stop();
  return true;
}

function startCancelListener(subscriberFactory = () => createQueueRedisConnection('ai-cancel')) {
  let subscriber;
  try {
    subscriber = subscriberFactory();
    subscriber.subscribe(AI_CANCEL_CHANNEL).catch((e) => console.error(`[ai-queue] cancel channel subscribe failed: ${e.message}`));
    subscriber.on('message', (channel, jobKey) => {
      if (channel === AI_CANCEL_CHANNEL && cancelRunningJob(jobKey)) qlog('CANCEL PUSHED by backend', { jobKey });
    });
  } catch (e) {
    console.error(`[ai-queue] cancel listener not started: ${e.message}`);
  }
  return subscriber;
}

// One readable line per queue lifecycle event. Never logs payloads or secrets.
const qlog = (event, fields = {}) => console.log(`[ai-queue] ${event}`, fields);

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
    const fetchStarted = Date.now();
    try {
      input = await deps.backend.fetchPayload(jobKey);
    } catch (error) {
      if (error.skipJob) {
        qlog('SKIPPED (not runnable)', { jobKey, reason: error.message });
        return { skipped: true, reason: error.message };
      }
      qlog('PAYLOAD FETCH FAILED', { jobKey, ms: Date.now() - fetchStarted, error: String(error.message).slice(0, 200) });
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
      if (cancelled) {
        qlog('STOPPED (cancelled by user)', { jobKey, stage: currentStage });
        throw Object.assign(new Error('Job cancelled'), { cancelled: true });
      }
      currentStage = stage;
      qlog('STAGE', { jobKey, stage, status });
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

    // Pressing Stop frees this worker slot at once (the next queued job starts) instead of waiting for the
    // current model call to return; the abandoned run then ends at its next stage / LLM call boundary.
    let stopNow;
    const stopped = new Promise((_, reject) => {
      stopNow = () => { cancelled = true; reject(Object.assign(new Error('Job cancelled'), { cancelled: true })); };
    });
    stopped.catch(() => {});
    runningJobs.set(jobKey, stopNow);

    try {
      const run = deps.pickRunner(mode);
      const running = withTimeout(runWithJob(jobContext, () => run(payload, { onStage })), cfg.timeoutMs);
      running.catch(() => {}); // an abandoned run must never become an unhandled rejection
      const result = await Promise.race([running, stopped]);
      await deps.backend.deliverTerminal('completed', jobKey, { result, generationMeta: { agents } });
      return { ok: true };
    } catch (error) {
      if (error.cancelled || cancelled) {
        qlog('REMOVED from processing (cancelled by user)', { jobKey, stage: currentStage });
        return { cancelled: true };
      }
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
    } finally {
      runningJobs.delete(jobKey);
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

  // Queue lifecycle: waiting -> TAKEN (active) -> completed / failed / stalled / drained.
  worker.on('ready', () => qlog('WORKER READY, waiting for jobs', { queue: QUEUE_NAMES.AI, concurrency: cfg.concurrency }));
  worker.on('active', (job) => {
    qlog('TAKEN from queue', {
      jobKey: job?.data?.jobKey,
      attempt: (job?.attemptsMade || 0) + 1,
      waitedMs: job?.processedOn && job?.timestamp ? job.processedOn - job.timestamp : null,
    });
  });
  worker.on('completed', (job, result) => {
    qlog(result?.cancelled ? 'FINISHED (cancelled)' : result?.skipped ? 'FINISHED (skipped)' : 'COMPLETED', {
      jobKey: job?.data?.jobKey,
      durationMs: job?.finishedOn && job?.processedOn ? job.finishedOn - job.processedOn : null,
    });
  });
  worker.on('stalled', (jobId) => qlog('STALLED (lock lost - worker died, restarted or event loop blocked)', { jobId }));
  worker.on('drained', () => qlog('QUEUE EMPTY (nothing left to take)', { queue: QUEUE_NAMES.AI }));

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
  if (!connection) {
    const subscriber = startCancelListener();
    worker.on('closing', () => { subscriber?.quit?.().catch(() => subscriber.disconnect?.()); });
  }
  worker.on('error', (error) => console.error(`[ai-queue] worker error: ${error.code || error.message}`));
  return worker;
}

module.exports = { createAiWorker, createAiProcessor, settings, cancelRunningJob, startCancelListener };
