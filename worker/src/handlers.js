// Task type -> handler. Each handler reuses the existing job implementation.
// Overlap guards inside those implementations also dedupe against the schedulers.

const { processEndedAuctions } = require('./jobs/auction.cron.service');
const { runScheduledAiStudioCleanup } = require('./jobs/aiStudio.cleanup.cron.service');
const { runScheduledCleanup: runSupabaseCleanup } = require('./jobs/supabase.cleanup.cron.service');
const { runScheduledBackup, runManualBackup } = require('./jobs/backup.cron.service');
const { sendTaskProgress } = require('./callback');
const kashiFixer = require('../../backend/src/modules/kashi/kashiFixer.service');

const TASK_TYPES = {
  PROCESS_ENDED_AUCTIONS: 'PROCESS_ENDED_AUCTIONS',
  AI_STUDIO_CLEANUP: 'AI_STUDIO_CLEANUP',
  SUPABASE_CLEANUP: 'SUPABASE_CLEANUP',
  RUN_BACKUP: 'RUN_BACKUP',
  KASHI_FIX: 'KASHI_FIX',
};

const handlers = {
  [TASK_TYPES.PROCESS_ENDED_AUCTIONS]: async () => { await processEndedAuctions(); return { ok: true }; },
  [TASK_TYPES.AI_STUDIO_CLEANUP]: async () => { await runScheduledAiStudioCleanup(); return { ok: true }; },
  [TASK_TYPES.SUPABASE_CLEANUP]: async () => { await runSupabaseCleanup(); return { ok: true }; },
  // With payload.kind (admin panel) -> manual backup/restore; without -> same as the scheduled run.
  [TASK_TYPES.RUN_BACKUP]: async (payload) => {
    if (payload && payload.kind) return runManualBackup(payload);
    await runScheduledBackup();
    return { ok: true };
  },
  [TASK_TYPES.KASHI_FIX]: async (payload, task) => {
    if (!payload?.runId) throw new Error('KASHI_FIX requires runId');
    await kashiFixer.runLoop(payload.runId, {
      onProgress: (event) => sendTaskProgress(task, event),
    });
    return { ok: true, runId: payload.runId };
  },
};

module.exports = { TASK_TYPES, handlers };
