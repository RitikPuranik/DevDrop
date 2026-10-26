'use strict';

const QueueJob = require('../../../backend/src/infrastructure/queue/queueJob.model');
const queues = require('../../../backend/src/infrastructure/queue/queues');
const { getQueue } = queues;
const { JOB_TYPES, EMAIL_JOB_TYPES, QUEUE_NAMES, permanent, sanitizeError } = require('../../../backend/src/infrastructure/queue');
const jobStore = require('../../../backend/src/infrastructure/queue/jobStore');
const { processEmailJob } = require('../../../backend/src/infrastructure/events/emailProcessor');
const { processEndedAuctions } = require('../jobs/auction.cron.service');
const { runScheduledAiStudioCleanup } = require('../jobs/aiStudio.cleanup.cron.service');
const { runScheduledCleanup: runSupabaseCleanup } = require('../jobs/supabase.cleanup.cron.service');
const { runScheduledBackup, runManualBackup } = require('../jobs/backup.cron.service');

const RECONCILE_AFTER_MS = Number.parseInt(process.env.QUEUE_RECONCILE_AFTER_MS || String(3 * 60 * 1000), 10);

// ai-queue / deployment-queue jobs are finalised by their own workers; if one dies without reporting
// (worker lost, Redis flushed), the MongoDB record would stay "active" forever. Compare with BullMQ.
const reconcileJobs = async () => {
  const cutoff = new Date(Date.now() - RECONCILE_AFTER_MS);
  const stale = await QueueJob.find({
    queue: { $in: [QUEUE_NAMES.AI, QUEUE_NAMES.DEPLOYMENT] },
    status: { $in: ['queued', 'active'] },
    publishPending: { $ne: true },
    updatedAt: { $lte: cutoff },
  }).limit(50);
  let fixed = 0;
  for (const rec of stale) {
    const bull = await getQueue(rec.queue).getJob(queues.toBullJobId(rec.jobKey)).catch(() => undefined);
    if (bull === undefined) continue; // Redis unreachable: decide nothing
    if (!bull) {
      await jobStore.markFailed(rec.jobKey, { code: 'JOB_LOST', message: 'The job disappeared from the queue before finishing.', class: 'transient' }, { queue: rec.queue });
      fixed += 1;
      continue;
    }
    if ((await bull.getState()) === 'failed') {
      await jobStore.markFailed(rec.jobKey, sanitizeError(new Error(bull.failedReason || 'Job failed')), { queue: rec.queue, attemptsMade: bull.attemptsMade });
      fixed += 1;
    }
  }
  return { checked: stale.length, fixed };
};

const processEventsJob = async (job, ctx) => {
  if (EMAIL_JOB_TYPES.has(job.name)) return processEmailJob(job, ctx);

  switch (job.name) {
    case JOB_TYPES.OUTBOX_SWEEP: {
      const published = await queues.sweepPendingPublishes();
      const reconciled = await reconcileJobs();
      return { result: { published, reconciled } };
    }
    case JOB_TYPES.PROCESS_ENDED_AUCTIONS:
      await processEndedAuctions();
      return { result: { ok: true } };
    case JOB_TYPES.AI_STUDIO_CLEANUP:
      await runScheduledAiStudioCleanup();
      return { result: { ok: true } };
    case JOB_TYPES.SUPABASE_CLEANUP:
      await runSupabaseCleanup();
      return { result: { ok: true } };
    case JOB_TYPES.RUN_BACKUP: {
      const params = job.data?.params;
      // With params.kind (admin panel) -> manual backup/restore; without -> same as the scheduled run.
      if (params && params.kind) return { result: (await runManualBackup(params)) ?? { ok: true } };
      await runScheduledBackup();
      return { result: { ok: true } };
    }
    default:
      throw permanent(`No events-queue handler for ${job.name}`, 'UNKNOWN_JOB_TYPE');
  }
};

module.exports = { processEventsJob, reconcileJobs };
