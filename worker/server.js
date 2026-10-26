require('dotenv').config();

const path = require('path');

const { createApp } = require('./src/app');
const { processDeploymentJob, onDeploymentFinalFailure } = require('./src/processors/deployment');
const { processEventsJob } = require('./src/processors/events');
const { registerSchedules } = require('./src/schedules');
const connectDB = require('../backend/src/shared/config/database');
const queue = require('../backend/src/infrastructure/queue');
const { closeCacheClient } = require('../backend/src/infrastructure/cache');

const PORT = process.env.PORT || 4000;
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || '25000', 10);

if (!process.env.QUEUE_REDIS_URL) {
  console.error('❌ QUEUE_REDIS_URL is required (Upstash queue database for BullMQ)');
  process.exit(1);
}
if (!process.env.INTERNAL_WEBHOOK_SECRET) {
  console.error('❌ INTERNAL_WEBHOOK_SECRET is required (signs Kashi progress callbacks to the Backend)');
  process.exit(1);
}

const cfg = queue.getQueueConfig();
let workers = [];
let server = null;
let monitor = null;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal} received — shutting down Worker`);
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS + 10000);
  forceExit.unref();

  if (server) server.close();
  if (monitor) monitor.stop();
  // Stop taking jobs, wait (bounded) for active ones; anything left is re-run by BullMQ's stalled-job recovery.
  const drained = await queue.gracefulClose(workers, { timeoutMs: SHUTDOWN_TIMEOUT_MS, extra: [queue.closeQueues, closeCacheClient] });
  if (!drained) console.warn('⚠️  Shutdown timeout reached with jobs still running (they will be recovered as stalled)');

  try {
    // Same mongoose instance the Backend models are registered on.
    await require(require.resolve('mongoose', { paths: [path.join(__dirname, '../backend')] })).disconnect();
  } catch (e) {
    console.warn('⚠️  Mongo disconnect failed:', e.message);
  }
  process.exit(drained ? 0 : 1);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// A stray rejection from any job must never crash the Worker.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

const getHealth = async () => {
  const snapshot = await queue.getQueueSnapshot();
  const warnings = Object.entries(snapshot).flatMap(([name, s]) => s.warnings.map((w) => `${name}:${w}`));
  return {
    ok: !shuttingDown,
    details: {
      concurrency: cfg.concurrency,
      queues: snapshot,
      workers: queue.getWorkerStats(),
      warnings,
    },
  };
};

const start = async () => {
  await connectDB();

  workers = [
    queue.createQueueWorker({
      queueName: queue.QUEUE_NAMES.DEPLOYMENT,
      processor: processDeploymentJob,
      concurrency: cfg.concurrency.deployment,
      timeoutMs: cfg.timeoutMs.deployment,
      onFinalFailure: onDeploymentFinalFailure,
    }),
    queue.createQueueWorker({
      queueName: queue.QUEUE_NAMES.EVENTS,
      processor: processEventsJob,
      concurrency: cfg.concurrency.events,
      timeoutMs: (job) => (queue.EMAIL_JOB_TYPES.has(job.name) ? cfg.timeoutMs.events : cfg.timeoutMs.maintenance),
      timeoutTransient: (job) => queue.EMAIL_JOB_TYPES.has(job.name),
    }),
  ];
  await registerSchedules();
  monitor = queue.startQueueMonitor();

  server = createApp({ getHealth }).listen(PORT, () => {
    console.log(`🚀 Worker running on port ${PORT} in ${process.env.NODE_ENV} mode (deployment x${cfg.concurrency.deployment}, events x${cfg.concurrency.events})`);

    // Keep-alive: ping self every 4 minutes to prevent Render free tier from sleeping
    const workerUrl = process.env.WORKER_URL;
    if (workerUrl && process.env.NODE_ENV === 'production') {
      const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes
      setInterval(async () => {
        try {
          const pingUrl = workerUrl.endsWith('/') ? `${workerUrl}health` : `${workerUrl}/health`;
          const res = await fetch(pingUrl);
          console.log(`🏓 [worker] Keep-alive ping: ${res.status}`);
        } catch (err) {
          console.warn('⚠️  [worker] Keep-alive ping failed:', err.message);
        }
      }, PING_INTERVAL);
      console.log(`✅ [worker] Keep-alive started: pinging ${workerUrl} every 4 minutes`);
    }
  });
};

start().catch((error) => {
  console.error('❌ Worker failed to start:', error.message);
  process.exit(1);
});
