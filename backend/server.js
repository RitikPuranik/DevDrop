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

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
};

startServer();
