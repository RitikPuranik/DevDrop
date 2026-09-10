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
  // Lets the preview workspace know a project has generated files it can
  // fetch from GET /generation/jobs/:jobId/files, without shipping the
  // (potentially large) file contents on every status poll.
  hasFiles: Boolean(job.lastKnownFiles),
  // Non-null while an "Edit with AI" request is in flight — the frontend
  // resumes polling GET /generation/jobs/:jobId/modify/:chatJobId against
  // this id (e.g. after a page reload) instead of assuming the edit is
  // done just because the generation's own status looks terminal.
  activeChatJobId: job.activeChatJobId || null,
  canUndo: Boolean(job.previousFiles),
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
 *
 * Genie's /api/chat only enqueues the edit and hands back a chat job id;
 * it does NOT flip the generation's own status, so this endpoint tracks
 * that chat job id (`activeChatJobId`) instead of assuming a later poll
 * of the generation itself will reflect the edit. The frontend polls
 * GET /generation/jobs/:jobId/modify/:chatJobId to find out when it's
 * actually done (see getModificationStatus below).
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
    if (record.activeChatJobId) {
      return res.status(409).json({ success: false, message: 'An edit is already in progress for this project.' });
    }

    const { chatJobId } = await genieService.sendModification(
      {
        genieGenerationId: record.genieGenerationId,
        message,
        currentFiles: record.lastKnownFiles,
      },
      { ownerId: req.userId.toString() }
    );

    // Keep the previous working file set recoverable (Section 20 — undo)
    // and mark the edit in flight against its own chat job id.
    record.previousFiles = record.lastKnownFiles;
    record.activeChatJobId = chatJobId;
    record.status = 'processing';
    if (!Array.isArray(record.editHistory)) record.editHistory = [];
    record.editHistory.push({ role: 'user', message });
    await record.save();

    return res.status(202).json({ success: true, chatJobId, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to send modification request.');
  }
};

/**
 * GET /api/ai/generation/jobs/:jobId/modify/:chatJobId
 * Polled by the "Edit with AI" panel while an edit is in flight. Reads
 * Genie's chat job status directly (Section 26 bug fix — the generation's
 * own status never reflects an in-progress edit). On completion, applies
 * the returned files (if any — a purely conversational reply completes
 * with none) to `lastKnownFiles` and clears `activeChatJobId`. On error,
 * the previous working files are left untouched so the last good preview
 * stays recoverable (Section 18/19).
 */
const getModificationStatus = async (req, res) => {
  try {
    const { jobId, chatJobId } = req.params;
    const record = await AiGenerationJob.findOne({ genieGenerationId: jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (record.activeChatJobId !== chatJobId) {
      return res.status(404).json({ success: false, message: 'This edit is no longer active for this project.' });
    }

    const chatStatus = await genieService.getChatJobStatus(chatJobId, { ownerId: req.userId.toString() });

    if (chatStatus.status === 'completed') {
      if (chatStatus.files) record.lastKnownFiles = chatStatus.files;
      record.status = 'completed';
      record.activeChatJobId = null;
      if (chatStatus.summary) {
        if (!Array.isArray(record.editHistory)) record.editHistory = [];
        record.editHistory.push({ role: 'assistant', message: chatStatus.summary });
      }
      await record.save();
      return res.json({
        success: true,
        status: 'completed',
        summary: chatStatus.summary,
        filesChanged: Boolean(chatStatus.files),
        ...jobToResponse(record),
      });
    }

    if (chatStatus.status === 'error') {
      record.status = 'completed'; // previous working project remains the source of truth
      record.activeChatJobId = null;
      await record.save();
      return res.json({
        success: true,
        status: 'error',
        message: chatStatus.error || 'Could not apply this change.',
        ...jobToResponse(record),
      });
    }

    // pending / processing
    return res.json({ success: true, status: chatStatus.status, ...jobToResponse(record) });
  } catch (error) {
    return handleGenieError(res, error, 'Failed to check modification status.');
  }
};

/**
 * GET /api/ai/generation/jobs/:jobId/files
 * Dedicated endpoint for the preview workspace to fetch the actual
 * generated project files (Section 6) — ownership-checked the same way
 * as every other job endpoint, never sent on lightweight status polls.
 */
const getGenerationJobFiles = async (req, res) => {
  try {
    const record = await AiGenerationJob.findOne({ genieGenerationId: req.params.jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (!record.lastKnownFiles) {
      return res.status(409).json({ success: false, message: 'This project has no generated files yet.' });
    }
    return res.json({ success: true, files: record.lastKnownFiles, editHistory: record.editHistory });
  } catch (error) {
    console.error('AI Studio (Genie) error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch generated files.' });
  }
};

/**
 * POST /api/ai/generation/jobs/:jobId/undo
 * Restores the file set from immediately before the most recent edit
 * (Section 20 — version safety). Only one level of undo is kept; there is
 * nothing to redo back to once used.
 */
const undoLastChange = async (req, res) => {
  try {
    const record = await AiGenerationJob.findOne({ genieGenerationId: req.params.jobId, userId: req.userId });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Generation job not found.' });
    }
    if (record.activeChatJobId) {
      return res.status(409).json({ success: false, message: 'Wait for the current edit to finish before undoing.' });
    }
    if (!record.previousFiles) {
      return res.status(409).json({ success: false, message: 'Nothing to undo.' });
    }

    record.lastKnownFiles = record.previousFiles;
    record.previousFiles = null;
    await record.save();

    return res.json({ success: true, files: record.lastKnownFiles, ...jobToResponse(record) });
  } catch (error) {
    console.error('AI Studio (Genie) error:', error);
    return res.status(500).json({ success: false, message: 'Failed to undo last change.' });
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
  getModificationStatus,
  getGenerationJobFiles,
  undoLastChange,
  uploadAsset,
};
