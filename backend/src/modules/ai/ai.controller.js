const genieService = require('../../services/genie/service');
const genieClient = require('../../services/genie/client');
const AiGenerationJob = require('./aiGenerationJob.model');
const supabaseService = require('../../services/supabase.service');
const { SUPABASE_FOLDERS } = require('../../shared/utils/constants');

// Only these fields are ever forwarded to Genie's adapter — anything else
// the frontend collects (targetAudience, primaryGoal, contact) stays a
// DevDrop-side concern until Genie's prompt-builder needs it.
const buildGenieRequestPayload = ({ websiteType, userData, preferences, assets }) => ({
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
  assets: Array.isArray(assets) ? assets : [],
});

// The frontend still expects the fields the old ai-service integration
// used (jobId/projectId/currentStage) so the polling hook and progress UI
// don't need a rewrite — genieGenerationId is the same value under both
// names since Genie has no separate "project" id, just a generation id.
const jobToResponse = (job) => ({
  jobId: job.genieGenerationId,
  projectId: job.genieGenerationId,
  status: job.status,
  repairAttempts: job.repairAttempts || 0,
  failureMessage: job.failureMessage,
  previewUrl: job.previewUrl,
  deploymentStatus: job.deploymentStatus,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

/**
 * POST /api/ai/generation/portfolio
 * Creates a new AI Studio generation job for the authenticated user via
 * the Genie microservice.
 */
const createPortfolioGeneration = async (req, res) => {
  try {
    const payload = buildGenieRequestPayload(req.body);

    const { genieGenerationId, status, prompt } = await genieService.startPortfolioGeneration(payload, {
      ownerId: req.userId.toString(),
    });

    const record = await AiGenerationJob.create({
      userId: req.userId,
      websiteType: payload.websiteType,
      genieGenerationId,
      status,
      generatedPrompt: prompt,
      requestPayload: payload,
    });

    return res.status(201).json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to start website generation.');
  }
};

/**
 * GET /api/ai/generation/jobs/:jobId
 * Polled by the frontend's GenerationProgress screen. Ownership is
 * enforced against the DevDrop-side record before ever calling Genie, so
 * a user can never poll another user's job by guessing an id. `jobId`
 * here is Genie's generation id (see jobToResponse above).
 */
const getGenerationJobStatus = async (req, res) => {
  try {
    const record = await AiGenerationJob.findOne({ genieGenerationId: req.params.jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }

    // Only ask Genie for full file contents once the job is about to
    // finish or has already finished — never on every poll tick.
    const wasTerminal = genieService.isGenerationTerminal(record.status);
    const genieStatus = await genieService.getGenerationStatus(record.genieGenerationId, {
      ownerId: req.userId.toString(),
      full: !wasTerminal, // fetch files right when it transitions to terminal
    });

    record.status = genieStatus.status;
    record.failureMessage = genieStatus.error || null;
    record.previewUrl = genieStatus.previewUrl;
    record.deploymentStatus = genieStatus.deploymentStatus;
    if (genieStatus.files) record.lastKnownFiles = genieStatus.files;
    await record.save();

    return res.json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to fetch generation status.');
  }
};

/**
 * POST /api/ai/generation/jobs/:jobId/retry
 * Starts a fresh generation from the original request payload rather
 * than mutating the failed job in place — a brand-new Genie generation id
 * ensures this is never confused with the failed attempt.
 */
const retryGeneration = async (req, res) => {
  try {
    const original = await AiGenerationJob.findOne({ genieGenerationId: req.params.jobId, userId: req.userId });
    if (!original) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (original.status !== 'failed') {
      return res.status(409).json({ success: false, message: 'Only a failed generation can be retried.' });
    }

    const { genieGenerationId, status, prompt } = await genieService.startPortfolioGeneration(original.requestPayload, {
      ownerId: req.userId.toString(),
    });

    const record = await AiGenerationJob.create({
      userId: req.userId,
      websiteType: original.websiteType,
      genieGenerationId,
      status,
      generatedPrompt: prompt,
      requestPayload: original.requestPayload,
    });

    return res.status(201).json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to retry generation.');
  }
};

/**
 * POST /api/ai/generation/jobs/:jobId/modify
 * Iterative editing (Section 5) — "change the navbar to dark blue and add
 * a login button". Sends the message to Genie's /api/chat together with
 * the project's last known files, so Genie edits the existing project
 * instead of generating something unrelated. Requires the job to have
 * completed at least once (there must be files to modify).
 */
const modifyGeneration = async (req, res) => {
  try {
    const message = (req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required.' });
    }

    const record = await AiGenerationJob.findOne({ genieGenerationId: req.params.jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (record.status !== 'completed' || !record.lastKnownFiles) {
      return res.status(409).json({ success: false, message: 'This project has not finished generating yet.' });
    }

    await genieService.sendModification(
      {
        genieGenerationId: record.genieGenerationId,
        message,
        currentFiles: record.lastKnownFiles,
      },
      { ownerId: req.userId.toString() }
    );

    // Genie processes chat edits asynchronously against the SAME
    // generation id — the existing status polling endpoint above picks up
    // the updated status/files once Genie finishes applying the edit.
    record.status = 'processing';
    await record.save();

    return res.status(202).json({ success: true, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to send modification request.');
  }
};

// Portfolio asset uploads (profile image, project images, resume). Reuses
// the existing Supabase storage service rather than a new storage
// platform; multer/mimetype/size validation is enforced by the
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

// Normalizes GenieServiceError (and any unexpected error) into DevDrop's
// standard { success, message } shape — the frontend never has to
// understand raw HTTP/Genie internals.
const handleGenieError = (res, error, fallbackMessage) => {
  if (error instanceof genieClient.GenieServiceError) {
    return res.status(error.status).json({
      success: false,
      message: error.message || fallbackMessage,
      code: error.code,
    });
  }
  console.error('AI Studio (Genie) error:', error);
  return res.status(500).json({ success: false, message: fallbackMessage });
};

module.exports = {
  createPortfolioGeneration,
  getGenerationJobStatus,
  retryGeneration,
  modifyGeneration,
  uploadAsset,
};
