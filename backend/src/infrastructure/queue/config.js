'use strict';

const int = (key, fallback, { min = 0 } = {}) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

// All tunables in one place; every value is overridable through the environment.
const getQueueConfig = () => ({
  concurrency: {
    ai: int('AI_QUEUE_CONCURRENCY', 1, { min: 1 }),
    deployment: int('DEPLOYMENT_QUEUE_CONCURRENCY', 1, { min: 1 }),
    events: int('EVENTS_QUEUE_CONCURRENCY', 2, { min: 1 }),
  },
  attempts: {
    ai: int('AI_JOB_ATTEMPTS', 2, { min: 1 }),
    deployment: int('DEPLOYMENT_JOB_ATTEMPTS', 2, { min: 1 }),
    events: int('EVENTS_JOB_ATTEMPTS', 4, { min: 1 }),
    otp: int('OTP_JOB_ATTEMPTS', 2, { min: 1 }),
  },
  backoffMs: {
    ai: int('AI_JOB_BACKOFF_MS', 15000),
    deployment: int('DEPLOYMENT_JOB_BACKOFF_MS', 30000),
    events: int('EVENTS_JOB_BACKOFF_MS', 5000),
  },
  timeoutMs: {
    // Processor-level hard stop; 0 disables.
    ai: int('AI_JOB_TIMEOUT_MS', 20 * 60 * 1000),
    deployment: int('DEPLOYMENT_JOB_TIMEOUT_MS', 45 * 60 * 1000),
    events: int('EVENTS_JOB_TIMEOUT_MS', 60 * 1000),
    // Backups / cleanups share events-queue but are long-running.
    maintenance: int('MAINTENANCE_JOB_TIMEOUT_MS', 30 * 60 * 1000),
  },
  retention: {
    completedAgeSec: int('QUEUE_KEEP_COMPLETED_SEC', 3600),
    completedCount: int('QUEUE_KEEP_COMPLETED_COUNT', 200),
    failedAgeSec: int('QUEUE_KEEP_FAILED_SEC', 7 * 24 * 3600),
    failedCount: int('QUEUE_KEEP_FAILED_COUNT', 500),
  },
  quota: {
    // AI quota exhaustion: delay (not retry) up to maxDelays times.
    maxDelays: int('AI_QUOTA_MAX_DELAYS', 0),
    minDelayMs: int('AI_QUOTA_MIN_DELAY_MS', 30000),
    maxDelayMs: int('AI_QUOTA_MAX_DELAY_MS', 15 * 60 * 1000),
  },
  otpTtlMs: int('OTP_JOB_TTL_MS', 5 * 60 * 1000),
  // Verification / password-reset link emails: a delivery job older than this is dropped, not sent.
  securityEmailTtlMs: int('SECURITY_EMAIL_JOB_TTL_MS', 15 * 60 * 1000),
  verifyCooldownMs: int('VERIFICATION_EMAIL_COOLDOWN_MS', 60 * 1000),
  stalledIntervalMs: int('QUEUE_STALLED_INTERVAL_MS', 60000),
  // Idle workers block on Redis this many seconds before re-polling (BullMQ default 5). New jobs still wake them at once.
  drainDelaySec: int('QUEUE_DRAIN_DELAY_SEC', 30, { min: 1 }),
  // Queue-depth monitor cadence (each tick reads several counters per queue). 0 disables it.
  monitorIntervalMs: int('QUEUE_MONITOR_INTERVAL_MS', 300000),
  // Set false to skip registering recurring schedules (auction sweep, outbox sweep, cleanups, backup) - e.g. on a dev machine.
  schedulesEnabled: !/^(0|false|no|off)$/i.test(String(process.env.QUEUE_SCHEDULES_ENABLED || 'true')),
  maxStalledCount: int('QUEUE_MAX_STALLED_COUNT', 1),
  monitor: {
    waitingWarnMs: int('QUEUE_WAITING_WARN_MS', 10 * 60 * 1000),
    depthWarn: int('QUEUE_DEPTH_WARN', 100),
    failedWarn: int('QUEUE_FAILED_WARN', 25),
  },
});

module.exports = { getQueueConfig };
