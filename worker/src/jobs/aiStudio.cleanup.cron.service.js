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


module.exports = { runScheduledAiStudioCleanup };
