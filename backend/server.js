require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/shared/config/database');
const seedDemoMarketplace = require('./src/services/demo.seed.service');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  try {
    // await seedDemoMarketplace();
    console.log('Demo marketplace seed disabled to prevent dummy data.');
  } catch (e) {
    console.warn('⚠️  Demo marketplace seed skipped:', e.message);
  }

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

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
 //for render to not sleep
  app.get("/api/ping", (req, res) => {
  res.status(200).json({ status: "alive" });
});
};

startServer();
