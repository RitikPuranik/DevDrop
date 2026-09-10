const crypto = require('crypto');
const aiClient = require('../../services/ai/ai.client');
const AiGenerationJob = require('./aiGenerationJob.model');
const supabaseService = require('../../services/supabase.service');
const { SUPABASE_FOLDERS } = require('../../shared/utils/constants');

// Only these fields are ever forwarded to the AI service (Section 16/39) —
// anything else the frontend collects (targetAudience, primaryGoal, contact)
// stays a DevDrop-side concern until the AI service's schema grows to
// accept it, so we never send values it doesn't know about.
const buildAiServicePayload = ({ websiteType, userData, preferences }) => ({
  websiteType: websiteType || 'portfolio',
  userData: {
    name: userData?.name,
    role: userData?.role,
    bio: userData?.bio || null,
    skills: Array.isArray(userData?.skills) ? userData.skills : [],
    projects: Array.isArray(userData?.projects)
      ? userData.projects.map((p) => ({ title: p.title, description: p.description || null, link: p.link || null }))
      : [],
    socialLinks: {
      github: userData?.socialLinks?.github || null,
      linkedin: userData?.socialLinks?.linkedin || null,
    },
  },
  preferences: {
    theme: preferences?.theme || null,
    style: preferences?.style || null,
    animations: typeof preferences?.animations === 'boolean' ? preferences.animations : null,
  },
});

const jobToResponse = (job) => ({
  jobId: job.jobId,
  projectId: job.projectId,
  status: job.status,
  currentStage: job.currentStage,
  repairAttempts: job.repairAttempts || 0,
  failureCode: job.failureCode,
  failureMessage: job.failureMessage,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

/**
 * POST /api/ai/generation/portfolio
 * Creates a new AI Studio generation job for the authenticated user.
 */
const createPortfolioGeneration = async (req, res) => {
  try {
    const payload = buildAiServicePayload(req.body);
    const idempotencyKey = crypto.randomUUID();

    const aiResponse = await aiClient.createGenerationJob(payload, {
      ownerId: req.userId.toString(),
      idempotencyKey,
    });

    const record = await AiGenerationJob.create({
      userId: req.userId,
      websiteType: payload.websiteType,
      jobId: aiResponse.jobId,
      projectId: aiResponse.projectId || null,
      status: aiResponse.status,
      currentStage: aiResponse.currentStage,
      repairAttempts: aiResponse.repairAttempts || 0,
      failureCode: aiResponse.failureCode || null,
      failureMessage: aiResponse.failureMessage || null,
      idempotencyKey,
      requestPayload: payload,
    });

    return res.status(201).json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleAiError(res, error, 'Failed to start website generation.');
  }
};

/**
 * GET /api/ai/generation/jobs/:jobId
 * Polled by the frontend's GenerationProgress screen. Ownership is
 * enforced against the DevDrop-side record before ever calling the AI
 * service, so a user can never poll another user's job by guessing an id.
 */
const getGenerationJobStatus = async (req, res) => {
  try {
    const record = await AiGenerationJob.findOne({ jobId: req.params.jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }

    const aiResponse = await aiClient.getGenerationJob(record.jobId);

    record.status = aiResponse.status;
    record.currentStage = aiResponse.currentStage;
    record.repairAttempts = aiResponse.repairAttempts || 0;
    record.projectId = aiResponse.projectId || record.projectId;
    record.failureCode = aiResponse.failureCode || null;
    record.failureMessage = aiResponse.failureMessage || null;
    await record.save();

    return res.json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleAiError(res, error, 'Failed to fetch generation status.');
  }
};

/**
 * POST /api/ai/generation/jobs/:jobId/retry
 * Starts a fresh generation job from the original request payload rather
 * than mutating the failed job in place (Section 22) — a brand-new
 * idempotency key ensures this is never confused with the failed attempt.
 */
const retryGeneration = async (req, res) => {
  try {
    const original = await AiGenerationJob.findOne({ jobId: req.params.jobId, userId: req.userId });
    if (!original) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (original.status !== 'failed') {
      return res.status(409).json({ success: false, message: 'Only a failed generation can be retried.' });
    }

    const idempotencyKey = crypto.randomUUID();
    const aiResponse = await aiClient.createGenerationJob(original.requestPayload, {
      ownerId: req.userId.toString(),
      idempotencyKey,
    });

    const record = await AiGenerationJob.create({
      userId: req.userId,
      websiteType: original.websiteType,
      jobId: aiResponse.jobId,
      projectId: aiResponse.projectId || null,
      status: aiResponse.status,
      currentStage: aiResponse.currentStage,
      repairAttempts: aiResponse.repairAttempts || 0,
      failureCode: aiResponse.failureCode || null,
      failureMessage: aiResponse.failureMessage || null,
      idempotencyKey,
      requestPayload: original.requestPayload,
    });

    return res.status(201).json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleAiError(res, error, 'Failed to retry generation.');
  }
};

// Portfolio asset uploads (profile image, project images, resume). Reuses
// the existing Supabase storage service (Section 10) rather than a new
// storage platform; multer/mimetype/size validation is enforced by the
// `uploadAiAsset` middleware in ai.upload.js before this ever runs.
const uploadAsset = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const assetType = req.body.type;
    const allowedTypes = ['profile-image', 'project-image', 'resume'];
    if (!allowedTypes.includes(assetType)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${allowedTypes.join(', ')}` });
    }

    const result = await supabaseService.uploadFile(req.file, SUPABASE_FOLDERS.AI_STUDIO_ASSETS);
    const url = supabaseService.getPublicUrl(result.path);

    return res.status(201).json({
      success: true,
      asset: { type: assetType, url, name: req.file.originalname, path: result.path, size: result.size },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to upload asset.' });
  }
};

// Normalizes AiServiceError (and any unexpected error) into DevDrop's
// standard { success, message } shape (Section 31) — the frontend never
// has to understand raw FastAPI/axios error internals.
const handleAiError = (res, error, fallbackMessage) => {
  if (error instanceof aiClient.AiServiceError) {
    return res.status(error.status).json({
      success: false,
      message: error.message || fallbackMessage,
      code: error.code,
      stage: error.stage,
    });
  }
  console.error('AI Studio error:', error);
  return res.status(500).json({ success: false, message: fallbackMessage });
};

module.exports = {
  createPortfolioGeneration,
  getGenerationJobStatus,
  retryGeneration,
  uploadAsset,
};
