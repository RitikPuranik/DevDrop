'use strict';

const { Worker, UnrecoverableError } = require('bullmq');
const { createQueueRedisConnection } = require('./connection');
const { getQueueConfig } = require('./config');
const { classifyError, sanitizeError, FAILURE } = require('./errors');
const jobStore = require('./jobStore');
const QueueJob = require('./queueJob.model');

const stats = new Map(); // queue -> counters (retry-rate monitoring)
const bump = (queue, key) => {
  const s = stats.get(queue) || { started: 0, completed: 0, retried: 0, failedFinal: 0, stalled: 0 };
  s[key] += 1;
  stats.set(queue, s);
};
const getWorkerStats = () => Object.fromEntries(stats);

// Jobs created by BullMQ's scheduler (repeatable) have no producer-written record: derive a key and create it.
const resolveJobKey = (job) => {
  if (job?.data?.jobKey) return job.data.jobKey;
  if (job && (job.repeatJobKey || job.opts?.repeat || /^repeat:/.test(String(job.id)))) return `sched-${job.id}`;
  return null;
};

const withTimeout = (promise, ms, transient) => {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Job exceeded ${Math.round(ms / 1000)}s`);
      err.code = 'JOB_TIMEOUT';
      // A timed-out processor may still be running; never retry side-effecting work blindly.
      err.failureClass = transient ? FAILURE.TRANSIENT : FAILURE.PERMANENT;
      reject(err);
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Creates a BullMQ worker with the shared lifecycle:
 *   - skips jobs whose Mongo record is already terminal (cancelled / replayed after completion)
 *   - records started / completed / failed in Mongo (jobStore)
 *   - classifies failures; permanent ones are never retried
 *   - final failures call onFinalFailure(job, error) for domain side effects
 *
 * processor(job, ctx) must return an outcome object ({ result, resultRef, delivery, generationMeta, skipped })
 * and may throw. ctx = { jobKey, record, progress(fields) }.
 */
const createQueueWorker = ({
  queueName,
  processor,
  concurrency,
  timeoutMs,
  timeoutTransient,
  onFinalFailure,
  onCompleted,
  connection,
  workerOptions = {},
}) => {
  const cfg = getQueueConfig();
  const conn = connection || createQueueRedisConnection(`worker-${queueName}`);

  const worker = new Worker(
    queueName,
    async (job) => {
      const jobKey = resolveJobKey(job);
      if (!jobKey) throw new UnrecoverableError('Job is missing jobKey');
      if (!job.data?.jobKey) {
        await QueueJob.updateOne(
          { jobKey },
          { $setOnInsert: { jobKey, queue: queueName, type: job.name, status: 'queued', enqueuedAt: new Date(), expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000) } },
          { upsert: true }
        );
      }
      const record = await QueueJob.findOne({ jobKey }).select('status');
      if (!record) throw new UnrecoverableError('No durable record for this job (it was removed).');
      if (QueueJob.TERMINAL.includes(record.status)) return { skipped: true, reason: `already ${record.status}` };

      bump(queueName, 'started');
      await jobStore.markActive(jobKey, { attemptsMade: job.attemptsMade + 1 });
      const ctx = {
        jobKey,
        progress: async (fields) => {
          const { progress, ...rest } = fields || {};
          if (progress != null) await job.updateProgress(progress).catch(() => {});
          return jobStore.markProgress(jobKey, { ...(progress != null ? { progress } : {}), ...rest });
        },
      };

      const ms = typeof timeoutMs === 'function' ? timeoutMs(job) : timeoutMs;
      const transient = typeof timeoutTransient === 'function' ? timeoutTransient(job) : false;
      const outcome = (await withTimeout(Promise.resolve(processor(job, ctx)), ms, transient)) || {};
      if (outcome.skipped) return outcome;
      await jobStore.markCompleted(jobKey, { queue: queueName, ...outcome });
      bump(queueName, 'completed');
      if (onCompleted) await Promise.resolve(onCompleted(job, outcome)).catch((e) => console.warn(`[${queueName}] onCompleted failed: ${e.message}`));
      return { ok: true };
    },
    {
      connection: conn,
      concurrency: concurrency || 1,
      stalledInterval: cfg.stalledIntervalMs,
      maxStalledCount: cfg.maxStalledCount,
      drainDelay: cfg.drainDelaySec,
      ...workerOptions,
    }
  );

  worker.on('failed', async (job, error) => {
    try {
      const jobKey = resolveJobKey(job);
      const stalled = /stalled/i.test(String(error?.message));
      if (stalled) bump(queueName, 'stalled');
      const klass = error instanceof UnrecoverableError ? FAILURE.PERMANENT : classifyError(error);
      const maxAttempts = job?.opts?.attempts || 1;
      const final = !job || stalled || klass === FAILURE.PERMANENT || job.attemptsMade >= maxAttempts;
      const safe = sanitizeError(error);

      console.warn(`[${queueName}] job ${job?.name || '?'} attempt ${job?.attemptsMade}/${maxAttempts} failed (${klass}): ${safe.message}`);
      if (!jobKey) return;

      if (final) {
        bump(queueName, 'failedFinal');
        const record = await jobStore.markFailed(jobKey, { ...safe, class: klass }, { queue: queueName, attemptsMade: job.attemptsMade });
        if (onFinalFailure && record) await Promise.resolve(onFinalFailure(job, error, record)).catch((e) => console.warn(`[${queueName}] onFinalFailure failed: ${e.message}`));
      } else {
        bump(queueName, 'retried');
        await jobStore.markProgress(jobKey, { status: 'queued', error: { ...safe, class: klass }, attemptsMade: job.attemptsMade });
      }
    } catch (e) {
      console.error(`[${queueName}] failed-handler error: ${e.message}`);
    }
  });
  worker.on('error', (error) => console.error(`[${queueName}] worker error: ${error.code || error.message}`));

  return worker;
};

/**
 * Graceful shutdown: stop taking jobs, wait for active ones (bounded), then close connections.
 */
const gracefulClose = async (workers, { timeoutMs = 25000, extra = [] } = {}) => {
  const closing = Promise.allSettled(workers.map((w) => w.close()));
  const finished = await Promise.race([
    closing.then(() => true),
    new Promise((resolve) => { const t = setTimeout(() => resolve(false), timeoutMs); t.unref?.(); }),
  ]);
  if (!finished) {
    // Active jobs did not drain in time: force-close; BullMQ's stalled-job recovery will re-run them.
    await Promise.allSettled(workers.map((w) => w.close(true)));
  }
  await Promise.allSettled(extra.map((fn) => fn()));
  return finished;
};

module.exports = { createQueueWorker, gracefulClose, getWorkerStats };
