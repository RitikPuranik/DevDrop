const cron = require('node-cron');
const { runCleanup } = require('../../scripts/cleanup-supabase-template-assets');

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

const startSupabaseCleanupCron = () => {
  const schedule = process.env.SUPABASE_CLEANUP_CRON || '0 3 * * 0';
  cron.schedule(schedule, runScheduledCleanup, { timezone: process.env.CRON_TIMEZONE || 'UTC' });
  console.log(`✅ Supabase cleanup cron started (${schedule})`);
};

module.exports = { startSupabaseCleanupCron, runScheduledCleanup };