require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/shared/config/database');
const socket = require('./src/shared/realtime/socket');

const PORT = process.env.PORT || 5000;

// Socket.IO needs the raw http.Server (not the Express app) so it can
// upgrade connections to websockets alongside the normal HTTP routes.
const httpServer = http.createServer(app);
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
].filter(Boolean);
socket.init(httpServer, { allowedOrigins });

// Close BullMQ producer + cache connections cleanly (the backend only enqueues; workers run elsewhere).
const shutdown = async (signal) => {
  console.log(`🛑 ${signal} received — closing backend`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  httpServer.close();
  await require('./src/infrastructure/queue/queues').closeQueues().catch(() => {});
  await require('./src/infrastructure/cache').closeCacheClient().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const startServer = async () => {
  await connectDB();

  // Background work is enqueued to BullMQ (QUEUE_REDIS_URL); workers run in ../worker (deployment/events) and ../ai-service (ai).

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);

    // Keep-alive: ping self every 4 minutes to prevent Render free tier from sleeping
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl && process.env.NODE_ENV === 'production') {
      const PING_INTERVAL = 4 * 60 * 1000; // 4 minutes
      setInterval(async () => {
        try {
          const pingUrl = backendUrl.endsWith('/') ? `${backendUrl}health` : `${backendUrl}/health`;
          const res = await fetch(pingUrl);
          console.log(`🏓 Keep-alive ping: ${res.status}`);
        } catch (err) {
          console.warn('⚠️  Keep-alive ping failed:', err.message);
        }
      }, PING_INTERVAL);
      console.log(`✅ Keep-alive started: pinging ${backendUrl} every 4 minutes`);
    }
  });
};


startServer();
