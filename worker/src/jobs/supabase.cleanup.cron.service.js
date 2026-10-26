const { runCleanup } = require('../../../backend/scripts/cleanup-supabase-template-assets');

let cleanupRunning = false;

const runScheduledCleanup = async () => {
  if (cleanupRunning) {
    console.log('ℹ️  Supabase cleanup skipped because a previous run is still active');
    return;
  }

  cleanupRunning = true;

  try {
    console.log('🧹 Starting scheduled Supabase template asset cleanup');
    await runCleanup({ apply: true });
    console.log('✅ Scheduled Supabase template asset cleanup finished');
  } catch (error) {
    console.error('Supabase cleanup cron error:', error);
  } finally {
    cleanupRunning = false;
  }
};


module.exports = { runScheduledCleanup };