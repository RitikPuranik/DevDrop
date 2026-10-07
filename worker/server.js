require('dotenv').config();

const path = require('path');

const { createApp } = require('./src/app');
const { createTaskRunner } = require('./src/taskRunner');
const { handlers } = require('./src/handlers');
const { sendTaskResult } = require('./src/callback');
const { startSchedulers } = require('./src/schedulers');
const connectDB = require('../backend/src/shared/config/database');

const PORT = process.env.PORT || 4000;
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || '25000', 10);

if (!process.env.INTERNAL_WEBHOOK_SECRET) {
  console.error('❌ INTERNAL_WEBHOOK_SECRET is required');
  process.exit(1);
}

const runner = createTaskRunner({
  handlers,
  concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  maxQueue: Number.parseInt(process.env.WORKER_MAX_QUEUE || '50', 10),
  onStatus: (task, status, extra) => sendTaskResult(task, status, extra),
});

let schedulers = null;
let server = null;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal} received — shutting down Worker`);

  if (schedulers) schedulers.stop();
  const forceExit = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS + 5000);
  forceExit.unref();

  if (server) server.close();
  const drained = await runner.drain(SHUTDOWN_TIMEOUT_MS);
  if (!drained) console.warn('⚠️  Shutdown timeout reached with tasks still running');

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

const start = async () => {
  await connectDB();
  schedulers = startSchedulers();
  server = createApp({ runner }).listen(PORT, () => {
    console.log(`🚀 Worker running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
};

start();
