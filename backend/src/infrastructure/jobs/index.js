'use strict';

const crypto = require('crypto');
const { enqueueJob } = require('../queue/queues');
const { QUEUE_NAMES, JOB_TYPES, PRIORITY } = require('../queue/names');
const QueueJob = require('../queue/queueJob.model');
const jobStore = require('../queue/jobStore');

// Producers for deployment-queue and the admin/maintenance work on events-queue.
// All are durable (outbox): the intent is stored in MongoDB first, so a Redis blip never loses a request.

const nonce = () => crypto.randomBytes(6).toString('hex');
const alreadyInFlight = (type, refId) => QueueJob.exists({ type, refId: String(refId), status: { $in: jobStore.ACTIVE } });

// One run per deployment at a time; the orchestrator itself is resumable, so a retried job never duplicates provider resources.
const enqueueDeployment = async (deploymentId, userId) => {
  if (await alreadyInFlight(JOB_TYPES.RUN_DEPLOYMENT, deploymentId)) return { duplicate: true };
  return enqueueJob({
    queue: QUEUE_NAMES.DEPLOYMENT,
    type: JOB_TYPES.RUN_DEPLOYMENT,
    jobKey: `deploy-${deploymentId}-${nonce()}`,
    userId,
    refType: 'deployment',
    refId: String(deploymentId),
    data: { deploymentId: String(deploymentId) },
    priority: PRIORITY.TRANSACTIONAL,
    durable: true,
  });
};

const enqueueProjectExport = async (exportId, { source = 'purchase', userId } = {}) => {
  if (await alreadyInFlight(JOB_TYPES.EXPORT_PROJECT, exportId)) return { duplicate: true };
  return enqueueJob({
    queue: QUEUE_NAMES.DEPLOYMENT,
    type: JOB_TYPES.EXPORT_PROJECT,
    jobKey: `export-${exportId}-${nonce()}`,
    userId,
    refType: 'export',
    refId: String(exportId),
    data: { exportId: String(exportId), source },
    durable: true,
  });
};

const enqueueKashiFix = async (runId, userId) => {
  if (await alreadyInFlight(JOB_TYPES.KASHI_FIX, runId)) return { duplicate: true };
  return enqueueJob({
    queue: QUEUE_NAMES.DEPLOYMENT,
    type: JOB_TYPES.KASHI_FIX,
    jobKey: `kashi-${runId}-${nonce()}`,
    userId,
    refType: 'kashi-run',
    refId: String(runId),
    data: { runId: String(runId) },
    attempts: 1, // the fix loop pushes commits/redeploys; never replay it blindly
    durable: true,
  });
};

const enqueueBackup = async (params, userId) => {
  const jobKey = `backup-${nonce()}`;
  const result = await enqueueJob({
    queue: QUEUE_NAMES.EVENTS,
    type: JOB_TYPES.RUN_BACKUP,
    jobKey,
    userId,
    refType: 'backup',
    data: { params },
    attempts: 1,
    priority: PRIORITY.MAINTENANCE,
    durable: true,
  });
  return { ...result, taskId: jobKey };
};

module.exports = { enqueueDeployment, enqueueProjectExport, enqueueKashiFix, enqueueBackup };
