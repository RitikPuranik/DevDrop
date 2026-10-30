'use strict';

const { upsertSchedule, QUEUE_NAMES, JOB_TYPES } = require('../../backend/src/infrastructure/queue');
const { getQueueConfig } = require('../../backend/src/infrastructure/queue/config');

// Every recurring task is a BullMQ job scheduler on events-queue. upsertJobScheduler is idempotent by id,
// so restarts and multiple worker instances never create duplicate schedules, and the Redis-side
// scheduler guarantees one run per tick. Schedules/time zones are unchanged from the old node-cron / setInterval setup.

const tz = () => process.env.CRON_TIMEZONE || 'UTC';
const MAX_INTERVAL_MS = 2147483647;

const backupRepeat = () => {
  const hours = parseFloat(process.env.BACKUP_INTERVAL_HOURS);
  if (process.env.BACKUP_INTERVAL_HOURS && !Number.isNaN(hours) && hours > 0) {
    return { every: Math.min(Math.round(hours * 3600 * 1000), MAX_INTERVAL_MS) };
  }
  if (process.env.BACKUP_CRON_SCHEDULE) return { pattern: process.env.BACKUP_CRON_SCHEDULE, tz: tz() };
  return { every: 24 * 3600 * 1000 };
};

const buildSchedules = () => [
  { id: 'schedule:ended-auctions', repeat: { every: Number.parseInt(process.env.AUCTION_SWEEP_INTERVAL_MS || '60000', 10) || 60000 }, type: JOB_TYPES.PROCESS_ENDED_AUCTIONS },
  { id: 'schedule:supabase-cleanup', repeat: { pattern: process.env.SUPABASE_CLEANUP_CRON || '0 3 * * 0', tz: tz() }, type: JOB_TYPES.SUPABASE_CLEANUP },
  { id: 'schedule:ai-studio-cleanup', repeat: { pattern: process.env.AI_STUDIO_CLEANUP_CRON || '*/5 * * * *', tz: tz() }, type: JOB_TYPES.AI_STUDIO_CLEANUP },
  { id: 'schedule:backup', repeat: backupRepeat(), type: JOB_TYPES.RUN_BACKUP },
  // Outbox republisher + lost-job reconciliation.
  { id: 'schedule:outbox-sweep', repeat: { every: Number.parseInt(process.env.OUTBOX_SWEEP_INTERVAL_MS || '60000', 10) }, type: JOB_TYPES.OUTBOX_SWEEP },
];

const registerSchedules = async () => {
  if (!getQueueConfig().schedulesEnabled) {
    console.log('Recurring schedules disabled (QUEUE_SCHEDULES_ENABLED=false)');
    return [];
  }
  const schedules = buildSchedules();
  for (const s of schedules) {
    try {
      await upsertSchedule(QUEUE_NAMES.EVENTS, s.id, s.repeat, { type: s.type });
    } catch (error) {
      console.warn(`⚠️  Schedule ${s.id} not registered: ${error.message}`);
    }
  }
  return schedules.map((s) => s.id);
};

module.exports = { registerSchedules, buildSchedules };
