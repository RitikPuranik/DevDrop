const AIStudioProject = require('../../modules/ai-studio/aiStudioProject.model');
const AIStudioAsset = require('../../modules/ai-studio/aiStudioAsset.model');
const storage = require('./aiStudioStorage.service');
const { buildProjectZip } = require('./aiStudioZip.service');
const logger = require('../../shared/utils/logger');

const { AI_STUDIO_PROJECT_STATUS } = AIStudioProject;

// Inactivity DETECTION threshold — NOT a maximum project lifetime. A
// project with continuing activity/heartbeats never hits this, no matter
// how old it is. Deliberately separate from AI_JOB_TTL_MS (Section 15),
// which only bounds an individual Gemini generation job result.
const INACTIVITY_THRESHOLD_MS = Number.parseInt(
  process.env.AI_STUDIO_INACTIVITY_THRESHOLD_MS || String(20 * 60 * 1000),
  10
);

const now = () => new Date();

/**
 * Creates a brand-new AI Studio project for this session, or resumes an
 * existing one the caller still owns. Resuming re-registers the session and
 * counts as activity, so re-opening a project you were already using can
 * never itself be misread as inactivity.
 */
async function openSession({ userId, sessionId, projectId, websiteType }) {
  if (projectId) {
    const existing = await AIStudioProject.findOne({ _id: projectId, userId });
    if (existing && existing.status !== AI_STUDIO_PROJECT_STATUS.DELETED && existing.status !== AI_STUDIO_PROJECT_STATUS.CLEANING) {
      existing.touchActivity();
      existing.lastVisibleAt = now();
      existing.sessions = existing.sessions.filter((s) => s.sessionId !== sessionId);
      existing.sessions.push({ sessionId, lastHeartbeatAt: now() });
      await existing.save();
      return existing;
    }
  }

  const created = new AIStudioProject({
    userId,
    sessionId,
    websiteType: websiteType || 'portfolio',
    sessions: [{ sessionId, lastHeartbeatAt: now() }],
    storagePrefix: 'pending', // replaced below once we have the real _id
  });
  created.storagePrefix = storage.storagePrefixFor(created._id);
  await created.save();
  return created;
}

async function getOwnedProject(projectId, userId) {
  const project = await AIStudioProject.findOne({ _id: projectId, userId });
  if (!project || project.status === AI_STUDIO_PROJECT_STATUS.DELETED) return null;
  return project;
}

/** Lightweight heartbeat — keeps the session (and project) marked alive. */
async function heartbeat({ projectId, userId, sessionId }) {
  // Atomically update liveness so cleanup cannot claim this project between
  // the liveness check and the heartbeat save.
  const at = now();
  const updated = await AIStudioProject.findOneAndUpdate(
    {
      _id: projectId,
      userId,
      status: { $in: [AI_STUDIO_PROJECT_STATUS.ACTIVE, AI_STUDIO_PROJECT_STATUS.INACTIVE] },
    },
    {
      $set: {
        lastActivityAt: at,
        lastHeartbeatAt: at,
        lastVisibleAt: at,
        status: AI_STUDIO_PROJECT_STATUS.ACTIVE,
      },
    },
    { new: true }
  );
  if (!updated) return null;

  const session = updated.sessions.find((s) => s.sessionId === sessionId);
  if (session) session.lastHeartbeatAt = at;
  else updated.sessions.push({ sessionId, lastHeartbeatAt: at });
  await updated.save();
  return updated;
}

/** Records a meaningful action (generate, edit, asset change, download, ...). */
async function recordActivity({ projectId, userId }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  project.touchActivity();
  await project.save();
  return project;
}

/**
 * Applies the latest generated file map, regenerates project.zip, and
 * replaces it in Supabase. Safe to call repeatedly/idempotently — it always
 * rebuilds from the full current file map and upserts the same zip path.
 */
async function syncGeneratedFiles({ projectId, userId, files, dependencies, title }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  if (files) project.files = files;
  if (dependencies) project.dependencies = dependencies;
  if (title) project.title = title;
  project.touchActivity();

  const zipBuffer = buildProjectZip(project.files);
  const zipPath = await storage.uploadProjectZip(project._id, zipBuffer);
  project.zipPath = zipPath;
  await project.save();
  return project;
}

async function addAsset({ projectId, userId, buffer, fileName, mimeType, size }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  const storagePath = await storage.uploadAsset(project._id, fileName, buffer, mimeType);
  const asset = await AIStudioAsset.create({
    projectId: project._id,
    userId,
    storagePath,
    fileName,
    mimeType,
    size,
  });
  project.touchActivity();
  await project.save();
  return asset;
}

async function removeAsset({ projectId, userId, assetId }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return false;
  const asset = await AIStudioAsset.findOne({ _id: assetId, projectId: project._id });
  if (!asset) return false;
  await storage.deleteAsset(asset.storagePath);
  await asset.deleteOne();
  project.touchActivity();
  await project.save();
  return true;
}

function isSessionStale(session, threshold = INACTIVITY_THRESHOLD_MS) {
  return now().getTime() - new Date(session.lastHeartbeatAt).getTime() > threshold;
}

/** True when neither an open tab nor recent meaningful activity keeps this project alive. */
function isAbandoned(project, threshold = INACTIVITY_THRESHOLD_MS) {
  const activityStale = now().getTime() - new Date(project.lastActivityAt).getTime() > threshold;
  if (!activityStale) return false;
  const hasLiveSession = (project.sessions || []).some((s) => !isSessionStale(s, threshold));
  return !hasLiveSession;
}

/**
 * Finds projects that look inactive, and downgrades any that no longer
 * qualify (e.g. a heartbeat landed in between) back to ACTIVE instead of
 * leaving them mislabeled.
 */
async function markInactiveProjects(threshold = INACTIVITY_THRESHOLD_MS) {
  const candidates = await AIStudioProject.find({
    status: { $in: [AI_STUDIO_PROJECT_STATUS.ACTIVE, AI_STUDIO_PROJECT_STATUS.INACTIVE] },
  });
  let marked = 0;
  for (const project of candidates) {
    if (isAbandoned(project, threshold)) {
      if (project.status !== AI_STUDIO_PROJECT_STATUS.INACTIVE) {
        project.status = AI_STUDIO_PROJECT_STATUS.INACTIVE;
        await project.save();
        marked += 1;
      }
    } else if (project.status === AI_STUDIO_PROJECT_STATUS.INACTIVE) {
      project.status = AI_STUDIO_PROJECT_STATUS.ACTIVE;
      await project.save();
    }
  }
  return marked;
}

/**
 * Deletes everything belonging to one project: Supabase storage objects,
 * asset metadata, then the project record itself. Idempotent/retryable —
 * uses a CLEANING state and only advances to DELETED once storage cleanup
 * has actually succeeded, so a crash mid-cleanup just gets retried rather
 * than orphaning files or losing the storage-path information needed to
 * finish the job.
 */
async function cleanupProject(projectId, { threshold = INACTIVITY_THRESHOLD_MS } = {}) {
  const cutoff = new Date(now().getTime() - threshold);

  // Claim cleanup atomically. A heartbeat that arrives before this query
  // completes makes the query fail, so an active tab cannot be deleted by a
  // stale cleanup snapshot.
  const project = await AIStudioProject.findOneAndUpdate(
    {
      _id: projectId,
      status: { $in: [AI_STUDIO_PROJECT_STATUS.INACTIVE, AI_STUDIO_PROJECT_STATUS.ACTIVE] },
      lastActivityAt: { $lte: cutoff },
      sessions: { $not: { $elemMatch: { lastHeartbeatAt: { $gt: cutoff } } } },
    },
    { $set: { status: AI_STUDIO_PROJECT_STATUS.CLEANING } },
    { new: true }
  );

  if (!project) return { skipped: true, reason: 'project became active again' };

  try {
    await storage.deleteProjectStorage(project._id);
    await AIStudioAsset.deleteMany({ projectId: project._id });
    project.status = AI_STUDIO_PROJECT_STATUS.DELETED;
    project.lastCleanupError = null;
    await project.save();
    await AIStudioProject.deleteOne({ _id: project._id });
    return { deleted: true };
  } catch (error) {
    project.cleanupAttempts += 1;
    project.lastCleanupError = error.message;
    // Stays in CLEANING with its storagePrefix intact so the next cron run
    // retries cleanly instead of losing track of the project.
    await project.save();
    logger.error('AI Studio cleanup failed, will retry', { projectId: String(project._id), error: error.message });
    return { deleted: false, error: error.message };
  }
}

/** Full worker pass: mark inactive, re-check, then clean up what's still abandoned. */
async function runCleanupSweep({ threshold = INACTIVITY_THRESHOLD_MS } = {}) {
  await markInactiveProjects(threshold);

  const toClean = await AIStudioProject.find({
    status: { $in: [AI_STUDIO_PROJECT_STATUS.INACTIVE, AI_STUDIO_PROJECT_STATUS.CLEANING] },
  });

  const results = { checked: toClean.length, deleted: 0, retried: 0, skipped: 0, failed: 0 };
  for (const project of toClean) {
    const result = await cleanupProject(project._id, { threshold });
    if (result.deleted) results.deleted += 1;
    else if (result.skipped) results.skipped += 1;
    else if (result.error) results.failed += 1;
  }
  return results;
}

async function deleteSessionTab({ projectId, userId, sessionId }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  project.sessions = project.sessions.filter((s) => s.sessionId !== sessionId);
  await project.save();
  return project;
}

module.exports = {
  INACTIVITY_THRESHOLD_MS,
  openSession,
  getOwnedProject,
  heartbeat,
  recordActivity,
  syncGeneratedFiles,
  addAsset,
  removeAsset,
  isAbandoned,
  markInactiveProjects,
  cleanupProject,
  runCleanupSweep,
  deleteSessionTab,
};
