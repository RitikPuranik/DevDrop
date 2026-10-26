const { AsyncLocalStorage } = require('async_hooks');

/**
 * Carries the current AI job through async calls so the Gemini pool and LLM
 * layer can (a) tag structured logs with the job id and (b) report/free the
 * job's worker slot while it waits for Gemini capacity, without every agent
 * having to pass those through its arguments.
 *
 * ctx shape (all optional):
 *   { jobId, onCapacityWait(info) -> async resume(), deadlineAt }
 */
const storage = new AsyncLocalStorage();

function runWithJob(ctx, fn) {
  return storage.run(ctx || {}, fn);
}

function getJobContext() {
  return storage.getStore() || {};
}

module.exports = { runWithJob, getJobContext };
