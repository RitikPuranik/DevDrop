'use strict';

const { Queue } = require('bullmq');
const { createQueueRedisConnection } = require('./connection');
const { QUEUE_NAMES, PRIORITY, AI_CANCEL_CHANNEL } = require('./names');
const { getQueueConfig } = require('./config');
const jobStore = require('./jobStore');
const QueueJob = require('./queueJob.model');

// One shared Redis connection for every Queue (producer side) in this process.
let connection = null;
const queues = new Map();

class QueueUnavailableError extends Error {
  constructor(message = 'Background job queue is temporarily unavailable.') {
    super(message);
    this.name = 'QueueUnavailableError';
    this.code = 'QUEUE_UNAVAILABLE';
    this.statusCode = 503;
  }
}

const getConnection = () => {
  if (!connection) connection = createQueueRedisConnection('producer');
  return connection;
};

const defaultJobOptions = (queueName) => {
  const cfg = getQueueConfig();
  const key = { [QUEUE_NAMES.AI]: 'ai', [QUEUE_NAMES.DEPLOYMENT]: 'deployment', [QUEUE_NAMES.EVENTS]: 'events' }[queueName];
  return {
    attempts: cfg.attempts[key],
    backoff: { type: 'exponential', delay: cfg.backoffMs[key] },
    removeOnComplete: { age: cfg.retention.completedAgeSec, count: cfg.retention.completedCount },
    removeOnFail: { age: cfg.retention.failedAgeSec, count: cfg.retention.failedCount },
  };
};

const getQueue = (name) => {
  if (!Object.values(QUEUE_NAMES).includes(name)) throw new Error(`Unknown queue "${name}"`);
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: getConnection(), defaultJobOptions: defaultJobOptions(name) }));
  }
  return queues.get(name);
};

// One readable line per queue lifecycle event (ADDED / REMOVED / DUPLICATE ...). Never logs payloads or secrets.
const qlog = (event, fields = {}) => console.log(`[queue] ${event}`, fields);

// BullMQ forbids ":" and purely numeric custom ids; keep ids opaque and URL-safe.
const toBullJobId = (jobKey) => {
  const id = String(jobKey).replace(/[^A-Za-z0-9_-]/g, '-');
  return /^\d+$/.test(id) ? `j-${id}` : id;
};

/**
 * Enqueue one job.
 *  - Mongo record is written first (jobKey is unique -> duplicate submissions collapse).
 *  - A duplicate of a queued/active/delayed job returns { duplicate: true } and enqueues nothing.
 *  - A duplicate of a finished job is also a no-op unless opts.rerun is true.
 *  - If Redis refuses the add, the record is marked failed and QueueUnavailableError is thrown:
 *    callers must never report "scheduled" in that case.
 */
const enqueueJob = async ({
  queue,
  type,
  jobKey,
  data = {},
  userId,
  refType,
  refId,
  mode,
  projectId,
  payload, // large input persisted in Mongo only
  priority = PRIORITY.NOTIFICATION,
  delayMs,
  attempts,
  durable = false, // outbox semantics: never throw once the intent is stored
  rerun = false,
}) => {
  if (!jobKey) throw new Error('enqueueJob requires a jobKey');

  const existing = await QueueJob.findOne({ jobKey }).select('status publishPending');
  if (existing) {
    const inFlight = jobStore.ACTIVE.includes(existing.status);
    if (inFlight || !rerun) {
      qlog('DUPLICATE IGNORED (already known)', { queue, type, jobKey, status: existing.status });
      return { jobKey, duplicate: true, status: existing.status, pending: Boolean(existing.publishPending) };
    }
    await QueueJob.deleteOne({ jobKey });
  }

  const opts = { priority };
  if (delayMs) opts.delay = delayMs;
  if (attempts) opts.attempts = attempts;
  const publishData = { jobKey, ...data };

  try {
    await QueueJob.create({
      jobKey,
      queue,
      type,
      userId,
      refType,
      refId,
      mode,
      ...(projectId ? { projectId: String(projectId) } : {}),
      status: 'queued',
      enqueuedAt: new Date(),
      ...(payload !== undefined ? { payload } : {}),
      ...(durable ? { publishPending: true, publishData, publishOpts: opts } : {}),
    });
  } catch (error) {
    if (error?.code === 11000) return { jobKey, duplicate: true, status: 'queued' }; // lost a creation race
    throw error;
  }

  try {
    await getQueue(queue).add(type, publishData, { ...opts, jobId: toBullJobId(jobKey) });
    // Fire-and-forget so a slow Redis never delays the HTTP response.
    getQueue(queue).getJobCounts('waiting', 'active', 'delayed')
      .then((c) => qlog('ADDED to queue', { queue, type, jobKey, priority, delayMs: delayMs || 0, ahead: { waiting: c.waiting, active: c.active, delayed: c.delayed } }))
      .catch(() => qlog('ADDED to queue', { queue, type, jobKey, priority }));
    if (durable) {
      await QueueJob.updateOne({ jobKey }, { $set: { publishPending: false }, $unset: { publishData: '', publishOpts: '' } }).catch(() => {});
    }
  } catch (error) {
    console.error(`[queue] enqueue failed for ${type} (${queue}): ${error.code || error.message}`);
    if (durable) {
      // Business state is already committed and the intent is stored: the sweeper will publish it.
      return { jobKey, duplicate: false, status: 'queued', accepted: false, pending: true };
    }
    await jobStore.markFailed(
      jobKey,
      { code: 'ENQUEUE_FAILED', message: 'Could not hand the job to the queue.', class: 'transient' },
      { queue }
    ).catch(() => {});
    throw new QueueUnavailableError();
  }
  return { jobKey, duplicate: false, status: 'queued', accepted: true, pending: false };
};

// Republishes durable jobs whose Redis add never completed (Redis outage, crash between the two writes).
// Safe to run repeatedly: BullMQ ignores a second add with the same jobId.
const sweepPendingPublishes = async ({ olderThanMs = 30000, limit = 50 } = {}) => {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await QueueJob.find({ publishPending: true, status: 'queued', createdAt: { $lte: cutoff } })
    .select('+publishData +publishOpts')
    .sort({ createdAt: 1 })
    .limit(limit);
  let published = 0;
  for (const rec of pending) {
    try {
      await getQueue(rec.queue).add(rec.type, rec.publishData || { jobKey: rec.jobKey }, {
        ...(rec.publishOpts || {}),
        jobId: toBullJobId(rec.jobKey),
      });
      await QueueJob.updateOne({ _id: rec._id }, { $set: { publishPending: false }, $unset: { publishData: '', publishOpts: '' } });
      published += 1;
    } catch (error) {
      await QueueJob.updateOne({ _id: rec._id }, { $inc: { publishAttempts: 1 } }).catch(() => {});
      console.warn(`[outbox] republish failed for ${rec.type}: ${error.code || error.message}`);
    }
  }
  return { checked: pending.length, published };
};

// Idempotent recurring schedule (survives restarts; no duplicates). tz preserved from cron settings.
const upsertSchedule = (queueName, schedulerId, repeat, { type, data = {} } = {}) =>
  getQueue(queueName).upsertJobScheduler(
    schedulerId,
    repeat,
    { name: type, data, opts: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 }, attempts: 1 } }
  );

const removeSchedule = (queueName, schedulerId) => getQueue(queueName).removeJobScheduler(schedulerId);

// Removes a queued/delayed job. `reason` is logged so it is always clear WHY a job left the queue
// (e.g. "cancelled by user"). A job that is already running cannot be removed here: it is told to stop
// through the webhook reply and ends at its next stage boundary (see the ai-service worker).
// True when BullMQ still holds this job (waiting/active/delayed). A Mongo record that says "queued" while
// Redis has no such job (queue flushed, job lost, worker never saw it) is a dead job nobody will ever run.
const isJobLive = async (queueName, jobKey) => {
  try {
    const job = await getQueue(queueName).getJob(toBullJobId(jobKey));
    if (!job) return false;
    const state = await job.getState();
    return ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'].includes(state);
  } catch {
    return true; // Redis unreachable: cannot tell, so do not declare the job dead
  }
};

// Push (no polling): tells the ai-service worker to stop a job that is already running.
// Best-effort: if it is not delivered, the worker still stops at its next stage boundary via the webhook reply.
const publishCancel = async (jobKey) => {
  try {
    await getConnection().publish(AI_CANCEL_CHANNEL, String(jobKey));
    return true;
  } catch (error) {
    console.warn(`[queue] could not publish cancel for ${jobKey}: ${error.message}`);
    return false;
  }
};

const removeWaitingJob = async (queueName, jobKey, reason = 'removed') => {
  try {
    const job = await getQueue(queueName).getJob(toBullJobId(jobKey));
    if (!job) {
      qlog('REMOVE SKIPPED (not in queue)', { queue: queueName, jobKey, reason });
      return false;
    }
    const state = await job.getState();
    if (['waiting', 'delayed', 'prioritized'].includes(state)) {
      await job.remove();
      qlog('REMOVED from queue', { queue: queueName, jobKey, state, reason });
      return true;
    }
    qlog('NOT REMOVED (already running or finished)', { queue: queueName, jobKey, state, reason, note: state === 'active' ? 'will stop at next stage boundary' : undefined });
  } catch (error) {
    console.warn(`[queue] could not remove job ${jobKey}: ${error.message}`);
  }
  return false;
};

const closeQueues = async () => {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
  if (connection) {
    await connection.quit().catch(() => connection.disconnect());
    connection = null;
  }
};

module.exports = {
  QueueUnavailableError,
  getQueue,
  getConnection,
  enqueueJob,
  sweepPendingPublishes,
  upsertSchedule,
  removeSchedule,
  removeWaitingJob,
  publishCancel,
  isJobLive,
  closeQueues,
  toBullJobId,
};
