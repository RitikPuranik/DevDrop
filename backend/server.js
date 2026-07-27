require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/shared/config/database');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  // Start auction cron jobs
  try {
    const auctionCron = require('./src/services/auction.cron.service');
    auctionCron.startAuctionCron();
    console.log('✅ Auction cron jobs started');
  } catch (e) {
    console.warn('⚠️  Auction cron not started:', e.message);
  }

  try {
    const supabaseCleanupCron = require('./src/services/supabase.cleanup.cron.service');
    supabaseCleanupCron.startSupabaseCleanupCron();
    console.log('✅ Supabase cleanup cron jobs started');
  } catch (e) {
    console.warn('⚠️  Supabase cleanup cron not started:', e.message);
  }

  try {
    const backupCron = require('./src/services/backup.cron.service');
    backupCron.startBackupCron();
    console.log('✅ Backup cron jobs started');
  } catch (e) {
    console.warn('⚠️  Backup cron not started:', e.message);
  }

  app.listen(PORT, () => {
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

app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

startServer();
