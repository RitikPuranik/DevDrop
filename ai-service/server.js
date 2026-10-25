require('dotenv').config();

const express = require('express');
const routes = require('./src/routes');
const { connectPoolDB } = require('./src/db');
const { createAiWorker, settings } = require('./src/queue/worker');

const app = express();

app.use(express.json({ limit: '15mb' })); // pool/kashi/deployment-plan requests

app.use('/', routes);

const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.AI_SHUTDOWN_TIMEOUT_MS || '25000', 10);

let aiWorker = null;
let httpServer = null;
let shuttingDown = false;

// Generation jobs arrive through the BullMQ `ai-queue` (Upstash queue database). The previous in-memory
// queue and its HTTP /jobs endpoints no longer exist.
function startAiWorker() {
  if (!process.env.QUEUE_REDIS_URL) {
    console.error('ai-service: QUEUE_REDIS_URL is not set — the ai-queue worker is NOT running, so no generation jobs will be processed.');
    return null;
  }
  const worker = createAiWorker();
  console.log(`ai-service: ai-queue worker started (concurrency ${settings().concurrency})`);
  app.locals.aiWorker = worker;
  return worker;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`ai-service: ${signal} received — shutting down`);
  const force = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS + 5000);
  force.unref();
  if (httpServer) httpServer.close();
  if (aiWorker) {
    // Stop taking jobs and let the running one finish; if it cannot, BullMQ's stalled-job recovery re-runs it.
    const drained = await Promise.race([
      aiWorker.close().then(() => true),
      new Promise((resolve) => { const t = setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS); t.unref?.(); }),
    ]);
    if (!drained) await aiWorker.close(true).catch(() => {});
  }
  process.exit(0);
}

if (require.main === module) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => console.error('ai-service unhandled rejection:', reason));

  httpServer = app.listen(PORT, () => {
    console.log(`ai-service listening on port ${PORT}`);

    // Keep-alive: ping self every 4 minutes to prevent Render free tier from sleeping
    const serviceUrl = process.env.AI_SERVICE_URL;
    if (serviceUrl && process.env.NODE_ENV === 'production') {
      const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes
      setInterval(async () => {
        try {
          const pingUrl = serviceUrl.endsWith('/') ? `${serviceUrl}health` : `${serviceUrl}/health`;
          const res = await fetch(pingUrl);
          console.log(`🏓 [ai-service] Keep-alive ping: ${res.status}`);
        } catch (err) {
          console.warn('⚠️  [ai-service] Keep-alive ping failed:', err.message);
        }
      }, PING_INTERVAL);
      console.log(`✅ [ai-service] Keep-alive started: pinging ${serviceUrl} every 4 minutes`);
    }
  });

  // Fire-and-forget: the Gemini pool falls back to GEMINI_API_KEY/GEMINI_API_KEYS from the
  // environment until/unless this connects, so generation works even before Mongo is reachable.
  connectPoolDB();
  aiWorker = startAiWorker();
}

module.exports = app;
