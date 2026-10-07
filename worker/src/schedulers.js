const { startAuctionCron } = require('./jobs/auction.cron.service');
const { startSupabaseCleanupCron } = require('./jobs/supabase.cleanup.cron.service');
const { startBackupCron } = require('./jobs/backup.cron.service');
const { startAiStudioCleanupCron } = require('./jobs/aiStudio.cleanup.cron.service');

// Starts every background scheduler. Returns a stop() that halts them all.
const startSchedulers = () => {
  const handles = [];
  const jobs = [
    ['Auction', startAuctionCron],
    ['Supabase cleanup', startSupabaseCleanupCron],
    ['Backup', startBackupCron],
    ['AI Studio cleanup', startAiStudioCleanupCron],
  ];
  for (const [name, start] of jobs) {
    try {
      const handle = start();
      if (handle) handles.push(handle);
    } catch (e) {
      console.warn(`⚠️  ${name} scheduler not started:`, e.message);
    }
  }
  return { stop: () => handles.forEach((h) => h.stop()) };
};

module.exports = { startSchedulers };
