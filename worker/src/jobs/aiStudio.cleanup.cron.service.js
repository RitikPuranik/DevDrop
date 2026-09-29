const cron = require('node-cron');
const { runCleanupSweep } = require('../../../backend/src/services/ai-studio/aiStudioLifecycle.service');

let cleanupRunning = false;

const runScheduledAiStudioCleanup = async () => {
  if (cleanupRunning) {
    console.log('ℹ️  AI Studio cleanup skipped because a previous run is still active');
    return;
  }

  cleanupRunning = true;

  try {
    const result = await runCleanupSweep();
    console.log('🧹 AI Studio cleanup sweep finished', result);
  } catch (error) {
    console.error('AI Studio cleanup cron error:', error);
  } finally {
    cleanupRunning = false;
  }
};

const startAiStudioCleanupCron = () => {
  // Runs frequently (every 5 minutes by default) since this is inactivity
  // detection, not a once-a-week sweep — abandoned projects should stop
  // costing storage well before a fixed calendar cleanup would ever catch them.
  const schedule = process.env.AI_STUDIO_CLEANUP_CRON || '*/5 * * * *';
  const task = cron.schedule(schedule, runScheduledAiStudioCleanup, { timezone: process.env.CRON_TIMEZONE || 'UTC' });
  console.log(`✅ AI Studio cleanup cron started (${schedule})`);
  return { stop: () => task.stop() };
};

module.exports = { startAiStudioCleanupCron, runScheduledAiStudioCleanup };
