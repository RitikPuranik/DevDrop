const mongoose = require('mongoose');
const AIStudioProject = require('../../modules/ai-studio/aiStudioProject.model');
const AIStudioAsset = require('../../modules/ai-studio/aiStudioAsset.model');
const AIStudioProjectVersion = require('../../modules/ai-studio/aiStudioProjectVersion.model');
const storage = require('./aiStudioStorage.service');
const { buildProjectZip, normalizeProjectFiles, buildVersionZip, readVersionZip } = require('./aiStudioZip.service');
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

// Oldest snapshots beyond this are pruned so a long editing session can't
// grow a project document set without bound.
const MAX_VERSIONS_PER_PROJECT = Number.parseInt(process.env.AI_STUDIO_MAX_VERSIONS || '50', 10);

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
async function syncGeneratedFiles({ projectId, userId, files, dependencies, title, source = 'sync', label = '' }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;

  const hadFiles = Object.keys(project.files || {}).length > 0;
  if (files) project.files = normalizeProjectFiles(files);
  if (dependencies) project.dependencies = dependencies;
  if (title) project.title = title;
  project.touchActivity();

  const zipBuffer = buildProjectZip(project.files);
  const zipPath = await storage.uploadProjectZip(project._id, zipBuffer);
  project.zipPath = zipPath;
  await project.save();

  // Only snapshot when there is real content to roll back to.
  if (files && Object.keys(project.files).length > 0) {
    const resolvedSource = source !== 'sync' ? source : hadFiles ? 'edit' : 'generate';
    await recordVersion(project, { source: resolvedSource, label });
  }
  return project;
}

/**
 * Snapshots the project's CURRENT files as the next version: the zip goes to
 * Supabase, the history row (metadata + storage path) goes to Mongo.
 * Best-effort: a failed snapshot is logged and never fails the user's edit.
 */
async function recordVersion(project, { source = 'sync', label = '' } = {}) {
  try {
    const bumped = await AIStudioProject.findOneAndUpdate(
      { _id: project._id },
      { $inc: { versionCounter: 1 } },
      { new: true, projection: { versionCounter: 1 } }
    );
    const version = bumped.versionCounter;
    const basedOnVersion = project.currentVersion || null;
    const storagePath = await storage.uploadVersionZip(
      project._id,
      version,
      buildVersionZip({ files: project.files, dependencies: project.dependencies, title: project.title })
    );
    let doc;
    try {
      doc = await AIStudioProjectVersion.create({
        projectId: project._id,
        userId: project.userId,
        version,
        source,
        label: String(label || '').slice(0, 300),
        basedOnVersion,
        title: project.title,
        storagePath,
        fileCount: Object.keys(project.files || {}).length,
      });
    } catch (err) {
      await storage.deleteObjects([storagePath]).catch(() => {}); // don't orphan the zip
      throw err;
    }

    // The new version is now the one the project's files correspond to.
    project.currentVersion = version;
    await AIStudioProject.findOneAndUpdate({ _id: project._id }, { $set: { currentVersion: version } });

    // Prune oldest beyond the cap (version numbers are never reused).
    let stale = await AIStudioProjectVersion.find({ projectId: project._id })
      .sort({ version: -1 })
      .skip(MAX_VERSIONS_PER_PROJECT)
      .select('_id storagePath version')
      .lean();
    // Never prune the version the project is currently on.
    stale = stale.filter((v) => v.version !== project.currentVersion);
    if (stale.length) {
      await storage.deleteObjects(stale.map((v) => v.storagePath)).catch((e) =>
        logger.error('AI Studio version prune (storage) failed', { error: e.message }));
      await AIStudioProjectVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
    }
    return doc;
  } catch (error) {
    logger.error('AI Studio version snapshot failed', { projectId: String(project._id), error: error.message });
    return null;
  }
}

/** Lightweight list (metadata only), newest first. */
async function listVersions({ projectId, userId }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  const versions = await AIStudioProjectVersion.find({ projectId: project._id })
    .sort({ version: -1 })
    .select('version label source basedOnVersion title fileCount createdAt')
    .lean();
  return { versions, currentVersion: project.currentVersion || (versions[0]?.version ?? 0) };
}

/** Full snapshot of one version (fetched from Supabase), e.g. to preview it. */
async function getVersion({ projectId, userId, version }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  const meta = await AIStudioProjectVersion.findOne({ projectId: project._id, version }).lean();
  if (!meta) return null;
  const snapshot = readVersionZip(await storage.downloadVersionZip(meta.storagePath));
  return { version: meta.version, source: meta.source, label: meta.label, createdAt: meta.createdAt, ...snapshot };
}

/**
 * Selects an older version: loads its zip from Supabase, makes it the
 * project's current files, rebuilds project.zip and moves the
 * `currentVersion` pointer. It does NOT create a new version and deletes
 * nothing. The next edit is recorded as "edited from vN".
 */
async function restoreVersion({ projectId, userId, version }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  const meta = await AIStudioProjectVersion.findOne({ projectId: project._id, version }).lean();
  if (!meta) return { notFound: true };
  const snapshot = readVersionZip(await storage.downloadVersionZip(meta.storagePath));

  project.files = normalizeProjectFiles(snapshot.files);
  project.dependencies = snapshot.dependencies;
  if (snapshot.title) project.title = snapshot.title;
  project.currentVersion = version;
  project.touchActivity();
  project.zipPath = await storage.uploadProjectZip(project._id, buildProjectZip(project.files));
  await project.save();
  return project;
}

async function addAsset({ projectId, userId, buffer, fileName, mimeType, size }) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  // Allocate the id first so the storage path is unique per asset (same file
  // name uploaded twice must not overwrite the first upload).
  const assetId = new mongoose.Types.ObjectId();
  const storagePath = await storage.uploadAsset(project._id, assetId, fileName, buffer, mimeType);
  let asset;
  try {
    asset = await AIStudioAsset.create({
    _id: assetId,
    projectId: project._id,
    userId,
    storagePath,
    fileName,
    mimeType,
    size,
    });
  } catch (error) {
    // Don't leave an orphaned object behind if the DB write fails.
    await storage.deleteAsset(storagePath).catch(() => {});
    throw error;
  }
  console.log('[AI STUDIO ASSET] uploaded', { projectId: String(project._id), assetId: String(assetId), mimeType, size });
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
    await AIStudioProjectVersion.deleteMany({ projectId: project._id });
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
  listVersions,
  getVersion,
  restoreVersion,
  addAsset,
  removeAsset,
  isAbandoned,
  markInactiveProjects,
  cleanupProject,
  runCleanupSweep,
  deleteSessionTab,
};
