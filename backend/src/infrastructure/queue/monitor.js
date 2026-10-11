'use strict';

const { getQueue } = require('./queues');
const { QUEUE_NAMES } = require('./names');
const { getQueueConfig } = require('./config');

// Point-in-time snapshot used by /health and the periodic monitor.
const getQueueSnapshot = async () => {
  const cfg = getQueueConfig().monitor;
  const out = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    const queue = getQueue(name);
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'prioritized');
    const waiting = (counts.waiting || 0) + (counts.prioritized || 0);
    const [oldest] = await queue.getWaiting(0, 0).catch(() => []);
    const oldestWaitMs = oldest?.timestamp ? Date.now() - oldest.timestamp : 0;
    const warnings = [];
    if (waiting >= cfg.depthWarn) warnings.push('queue_depth_high');
    if ((counts.failed || 0) >= cfg.failedWarn) warnings.push('many_failed_jobs');
    if (oldestWaitMs >= cfg.waitingWarnMs) warnings.push('jobs_waiting_too_long');
    out[name] = { ...counts, waiting, oldestWaitMs, warnings };
  }
  return out;
};

const startQueueMonitor = ({ intervalMs = 60000, logger = console } = {}) => {
  const timer = setInterval(async () => {
    try {
      const snapshot = await getQueueSnapshot();
      for (const [name, s] of Object.entries(snapshot)) {
        if (s.warnings.length) logger.warn(`[queue-monitor] ${name}: ${s.warnings.join(', ')}`, { waiting: s.waiting, failed: s.failed, oldestWaitMs: s.oldestWaitMs });
      }
    } catch (error) {
      logger.warn(`[queue-monitor] snapshot failed: ${error.code || error.message}`);
    }
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
};

module.exports = { getQueueSnapshot, startQueueMonitor };
