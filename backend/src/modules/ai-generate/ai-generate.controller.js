const crypto = require('crypto');
const { resolveGenerationAssets } = require('../../services/ai-studio/aiStudioAssetPipeline.service');
const queue = require('../../infrastructure/queue');
const { emitToJob } = require('../../shared/realtime/socket');

const { QUEUE_NAMES, JOB_TYPES, QueueJob, jobStore } = queue;

const REFERENCE_IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_REFERENCE_IMAGE_BYTES = 2.5 * 1024 * 1024;

// preferences.referenceImage is a whole-website screenshot of the selected style preview.
// Anything that is not a bounded base64 jpeg/png/webp data URL is dropped (never fails the request).
function sanitizePreferences(preferences) {
  const prefs = preferences && typeof preferences === 'object' ? { ...preferences } : {};
  const ref = prefs.referenceImage;
  delete prefs.referenceImage;
  if (typeof ref === 'string') {
    const m = REFERENCE_IMAGE_RE.exec(ref);
    if (m && Buffer.byteLength(m[2], 'base64') <= MAX_REFERENCE_IMAGE_BYTES) prefs.referenceImage = ref;
  }
  return prefs;
}
exports.sanitizePreferences = sanitizePreferences;

// Public (browser-facing) status vocabulary is unchanged: queued | processing | completed | failed.
const publicStatus = (status) => ({ active: 'processing', delayed: 'queued', cancelled: 'failed' }[status] || status);

const serializeJob = (job, debugAvailable) => {
  const base = {
    jobId: job.jobKey,
    status: publicStatus(job.status),
    currentStage: job.currentStage,
    stageStatus: job.stageStatus,
    generationMeta: job.generationMeta || { agents: [] },
    mode: job.mode,
    debugAvailable: Boolean(debugAvailable),
    statusMessage: job.statusMessage || null,
    waitingUntil: job.waitingUntil || null,
  };
  if (job.status === 'completed') return { ...base, result: job.result };
  if (job.status === 'failed') return { ...base, error: job.error?.message || 'AI generation failed', errorType: job.errorType || 'failed' };
  if (job.status === 'cancelled') return { ...base, error: 'Generation was cancelled.' };
  return base;
};

const hashPayload = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

const findOwnedJob = (jobKey, userId) => QueueJob.findOne({ jobKey, userId, type: JOB_TYPES.AI_GENERATE });

exports.generate = async (req, res) => {
  try {
    const { messages, fileData, websiteType, userData, preferences, assets, conversation, projectId } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ success:false, message:'No messages provided' });

    const existingFiles = fileData && fileData.files && typeof fileData.files === 'object' && Object.keys(fileData.files).length ? fileData.files : null;
    const hasExistingFiles = Boolean(existingFiles);
    // Throws 400/403/404/502 with a user-facing message for critical asset
    // problems; optional document-extraction problems are reported per asset
    // (assets.*.extraction.status) and never fail the request.
    const { assets: resolvedAssets, media } = await resolveGenerationAssets({
      projectId,
      userId: req.userId,
      rawAssets: assets,
      hasExistingFiles,
    });

    // An existing project's files travel with every follow-up request; their presence is what
    // distinguishes "edit an existing site" from "generate a new one".
    const mode = hasExistingFiles ? 'edit' : 'generate';
    const payload = {
      messages,
      fileData: fileData || null,
      websiteType: websiteType || 'portfolio',
      userData: userData || {},
      preferences: sanitizePreferences(preferences),
      assets: resolvedAssets,
      media,
      conversation: conversation || messages,
      mode,
      existingFiles,
      existingDependencies: (existingFiles && fileData?.dependencies) || {},
    };

    // Duplicate-submission protection: an identical request from the same user that is still
    // queued/running resolves to the existing job instead of burning provider quota twice.
    const payloadHash = hashPayload(payload);
    const inFlight = await QueueJob.findOne({
      userId: req.userId,
      type: JOB_TYPES.AI_GENERATE,
      refId: payloadHash,
      status: { $in: jobStore.ACTIVE },
    }).select('jobKey status mode');
    if (inFlight) {
      return res.status(202).json({ success:true, data:{ jobId: inFlight.jobKey, status: publicStatus(inFlight.status), mode: inFlight.mode, resumed: true } });
    }

    const jobKey = crypto.randomUUID();
    await queue.enqueueJob({
      queue: QUEUE_NAMES.AI,
      type: JOB_TYPES.AI_GENERATE,
      jobKey,
      userId: req.userId,
      refType: 'ai-payload',
      refId: payloadHash,
      mode,
      payload, // large input stays in MongoDB; Redis only carries the job key
      data: { mode },
      priority: queue.PRIORITY.TRANSACTIONAL,
    });
    res.status(202).json({ success:true, data:{ jobId: jobKey, status:'queued' } });
  } catch(error) {
    console.error('AI generate error:', error.message);
    if (error.code === 'QUEUE_UNAVAILABLE') return res.status(503).json({ success:false, message:'AI generation is temporarily unavailable. Please try again shortly.' });
    res.status(error.statusCode||500).json({success:false,message:error.userMessage||'Failed to generate app'});
  }
};

exports.getJob = async (req,res) => {
  try {
    const job = await findOwnedJob(req.params.id, req.userId);
    if (!job) return res.status(404).json({success:false,message:'Job not found'});
    const debugAvailable = job.status === 'failed' && await QueueJob.exists({ jobKey: job.jobKey, debugContext: { $exists: true } });
    res.status(200).json({success:true,data:serializeJob(job, debugAvailable)});
  } catch(error) {
    console.error('AI job status error:',error.message);
    res.status(500).json({success:false,message:'Failed to check AI generation status'});
  }
};

exports.debugRetry = async (req, res) => {
  try {
    const original = await QueueJob.findOne({ jobKey: req.params.id, userId: req.userId, type: JOB_TYPES.AI_GENERATE }).select('+debugContext status');
    if (!original) return res.status(404).json({ success:false, message:'Job not found' });
    if (original.status !== 'failed' || !original.debugContext) {
      return res.status(404).json({ success:false, message:'No debug retry is available for this job' });
    }
    const ctx = original.debugContext;
    const debugJobId = crypto.randomUUID();
    await queue.enqueueJob({
      queue: QUEUE_NAMES.AI,
      type: JOB_TYPES.AI_GENERATE,
      jobKey: debugJobId,
      userId: req.userId,
      refType: 'ai-debug-of',
      refId: original.jobKey,
      mode: 'debug',
      payload: {
        mode: 'debug',
        files: ctx.files,
        dependencies: ctx.dependencies,
        architecture: ctx.architecture,
        requirements: ctx.requirements,
        design: ctx.design,
        errors: ctx.errors,
        buildOutput: ctx.buildOutput,
        mediaManifest: ctx.mediaManifest || [],
        mediaPlan: ctx.mediaPlan || [],
      },
      data: { mode: 'debug' },
      priority: queue.PRIORITY.TRANSACTIONAL,
    });
    // The original job's debug context is single-use.
    await QueueJob.updateOne({ jobKey: original.jobKey }, { $unset: { debugContext: '' } });
    res.status(202).json({ success:true, data:{jobId:debugJobId,status:'queued',mode:'debug'} });
  } catch(error) {
    if (error.code === 'QUEUE_UNAVAILABLE') return res.status(503).json({ success:false, message:'AI generation is temporarily unavailable. Please try again shortly.' });
    res.status(error.statusCode||500).json({success:false,message:error.userMessage||'Failed to start debug retry'});
  }
};

// Queued/delayed jobs are removed from the queue; a running job stops at its next stage boundary.
exports.cancel = async (req, res) => {
  try {
    const job = await findOwnedJob(req.params.id, req.userId);
    if (!job) return res.status(404).json({ success:false, message:'Job not found' });
    if (QueueJob.TERMINAL.includes(job.status)) return res.status(409).json({ success:false, message:`Job already ${job.status}` });
    await queue.removeWaitingJob(QUEUE_NAMES.AI, job.jobKey);
    await jobStore.markCancelled(job.jobKey, { queue: QUEUE_NAMES.AI });
    emitToJob(job.jobKey, 'ai-job:failed', { jobId: job.jobKey, error: 'Generation was cancelled.' });
    res.status(200).json({ success:true, data:{ jobId: job.jobKey, status:'cancelled' } });
  } catch(error) {
    console.error('AI job cancel error:', error.message);
    res.status(500).json({ success:false, message:'Failed to cancel job' });
  }
};
