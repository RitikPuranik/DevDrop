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

const startServer = async () => {
  await connectDB();

  // Background/scheduled jobs (auctions, backups, cleanups) run in the Worker service (../worker).

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
