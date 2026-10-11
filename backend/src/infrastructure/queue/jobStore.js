'use strict';

const QueueJob = require('./queueJob.model');
const { sanitizeError } = require('./errors');

const DAY = 24 * 3600 * 1000;
const RETENTION = { default: 7 * DAY, ai: 30 * 60 * 1000, failed: 14 * DAY };

const expiryFor = (queue, status) => {
  if (status === 'failed') return new Date(Date.now() + (queue === 'ai-queue' ? 2 * 3600 * 1000 : RETENTION.failed));
  return new Date(Date.now() + (queue === 'ai-queue' ? RETENTION.ai : RETENTION.default));
};

const ACTIVE = ['queued', 'active', 'delayed'];

// Status transitions never move a job backwards out of a terminal state
// (a late "active" event must not overwrite "completed").
const guardTerminal = (jobKey) => ({ jobKey, status: { $nin: QueueJob.TERMINAL } });

const markActive = (jobKey, { attemptsMade } = {}) =>
  QueueJob.findOneAndUpdate(
    guardTerminal(jobKey),
    { $set: { status: 'active', startedAt: new Date(), ...(attemptsMade != null ? { attemptsMade } : {}) } },
    { new: true }
  );

const markProgress = (jobKey, fields) =>
  QueueJob.findOneAndUpdate(guardTerminal(jobKey), { $set: fields }, { new: true });

const markDelayed = (jobKey, { error, quotaDelays } = {}) =>
  QueueJob.findOneAndUpdate(
    guardTerminal(jobKey),
    { $set: { status: 'delayed', ...(error ? { error } : {}), ...(quotaDelays != null ? { quotaDelays } : {}) } },
    { new: true }
  );

const markCompleted = (jobKey, { queue, result, resultRef, generationMeta, delivery } = {}) =>
  QueueJob.findOneAndUpdate(
    guardTerminal(jobKey),
    {
      $set: {
        status: 'completed',
        progress: 100,
        currentStage: 'completed',
        stageStatus: 'completed',
        finishedAt: new Date(),
        expiresAt: expiryFor(queue, 'completed'),
        error: undefined,
        ...(result !== undefined ? { result } : {}),
        ...(resultRef ? { resultRef } : {}),
        ...(generationMeta ? { generationMeta } : {}),
        ...(delivery ? { delivery } : {}),
      },
      $unset: { payload: '' },
    },
    { new: true }
  );

const markFailed = (jobKey, error, { queue, debugContext, attemptsMade, errorType } = {}) =>
  QueueJob.findOneAndUpdate(
    guardTerminal(jobKey),
    {
      $set: {
        status: 'failed',
        currentStage: 'failed',
        stageStatus: 'failed',
        finishedAt: new Date(),
        expiresAt: expiryFor(queue, 'failed'),
        error: error && error.message && error.class ? error : sanitizeError(error),
        ...(debugContext ? { debugContext } : {}),
        ...(attemptsMade != null ? { attemptsMade } : {}),
        ...(errorType ? { errorType } : {}),
        statusMessage: null,
        waitingUntil: null,
      },
      $unset: { payload: '' },
    },
    { new: true }
  );

const markCancelled = (jobKey, { queue } = {}) =>
  QueueJob.findOneAndUpdate(
    guardTerminal(jobKey),
    { $set: { status: 'cancelled', finishedAt: new Date(), expiresAt: expiryFor(queue, 'completed') }, $unset: { payload: '' } },
    { new: true }
  );

const get = (jobKey) => QueueJob.findOne({ jobKey });
const getWithPayload = (jobKey) => QueueJob.findOne({ jobKey }).select('+payload');
const getWithDebugContext = (jobKey) => QueueJob.findOne({ jobKey }).select('+debugContext');

module.exports = {
  ACTIVE,
  markActive,
  markProgress,
  markDelayed,
  markCompleted,
  markFailed,
  markCancelled,
  get,
  getWithPayload,
  getWithDebugContext,
};
