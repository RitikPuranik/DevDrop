'use strict';

const Deployment = require('../../../backend/src/modules/deployment/deployment.model');
const ProjectExport = require('../../../backend/src/modules/github/projectExport.model');
const KashiFixRun = require('../../../backend/src/modules/kashi/kashiFixRun.model');
const { runDeployment } = require('../../../backend/src/services/deployment/orchestrator');
const projectExportService = require('../../../backend/src/services/projectExport.service');
const kashiFixer = require('../../../backend/src/modules/kashi/kashiFixer.service');
const { DEPLOYMENT_STATUS, EXPORT_STATUS } = require('../../../backend/src/shared/utils/constants');
const { JOB_TYPES, permanent } = require('../../../backend/src/infrastructure/queue');
const { sendTaskProgress } = require('../callback');

// Builds/deploys happen on the user's own Vercel/Render accounts (providers build the code);
// no user-supplied build command ever runs in this process.
const processDeploymentJob = async (job) => {
  switch (job.name) {
    case JOB_TYPES.RUN_DEPLOYMENT: {
      const { deploymentId } = job.data;
      // runDeployment is resumable (provider resources are looked up by stored id), so an interrupted
      // job that BullMQ recovers continues instead of creating a second Vercel project/Render service.
      await runDeployment(deploymentId);
      const deployment = await Deployment.findById(deploymentId).select('status errorMessage');
      if (!deployment) return { result: { skipped: true, reason: 'deployment_removed' } };
      if (deployment.status === DEPLOYMENT_STATUS.FAILED) {
        // The orchestrator already recorded the failure on the Deployment; do not retry (would re-run provider calls).
        throw permanent(deployment.errorMessage || 'Deployment failed', 'DEPLOYMENT_FAILED');
      }
      return { result: { deploymentId: String(deploymentId), status: deployment.status } };
    }

    case JOB_TYPES.EXPORT_PROJECT: {
      const { exportId, source } = job.data;
      const run = source === 'ai-studio' ? projectExportService.runAiStudioExport : projectExportService.runExport;
      await run(exportId);
      const doc = await ProjectExport.findById(exportId).select('status');
      if (doc && doc.status === EXPORT_STATUS.FAILED) throw permanent('GitHub export failed', 'EXPORT_FAILED');
      return { result: { exportId: String(exportId), status: doc?.status || 'unknown' } };
    }

    case JOB_TYPES.KASHI_FIX: {
      const { runId } = job.data;
      if (!runId) throw permanent('KASHI_FIX requires runId', 'BAD_PAYLOAD');
      const task = { taskId: job.data.jobKey };
      await kashiFixer.runLoop(runId, { onProgress: (event) => sendTaskProgress(task, event) });
      return { result: { runId: String(runId) } };
    }

    default:
      throw permanent(`No deployment-queue handler for ${job.name}`, 'UNKNOWN_JOB_TYPE');
  }
};

// Final failures that the domain code could not record itself (crash, stall, timeout).
const onDeploymentFinalFailure = async (job, error) => {
  const message = String(error?.message || 'Job failed').slice(0, 300);
  if (job.name === JOB_TYPES.RUN_DEPLOYMENT) {
    await Deployment.updateOne(
      { _id: job.data.deploymentId, status: { $nin: [DEPLOYMENT_STATUS.SUCCESS, DEPLOYMENT_STATUS.FAILED, DEPLOYMENT_STATUS.CANCELLED] } },
      { $set: { status: DEPLOYMENT_STATUS.FAILED, errorMessage: `Deployment worker stopped: ${message}` } }
    );
  } else if (job.name === JOB_TYPES.EXPORT_PROJECT) {
    await ProjectExport.updateOne(
      { _id: job.data.exportId, status: { $in: [EXPORT_STATUS.PENDING, EXPORT_STATUS.PROCESSING] } },
      { $set: { status: EXPORT_STATUS.FAILED } }
    );
  } else if (job.name === JOB_TYPES.KASHI_FIX) {
    const run = await KashiFixRun.findOneAndUpdate(
      { _id: job.data.runId, status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', finishedAt: new Date() } }
    );
    if (run) {
      await sendTaskProgress({ taskId: job.data.jobKey }, { type: 'status', runId: String(job.data.runId), status: 'failed', resultMessage: `Kashi worker task failed: ${message}`, finishedAt: new Date().toISOString() });
    }
  }
};

module.exports = { processDeploymentJob, onDeploymentFinalFailure };
