const lifecycle = require('../../services/ai-studio/aiStudioLifecycle.service');
const storage = require('../../services/ai-studio/aiStudioStorage.service');

const serializeProject = (project) => ({
  projectId: String(project._id),
  sessionId: project.sessionId,
  status: project.status,
  title: project.title,
  websiteType: project.websiteType,
  files: project.files || {},
  dependencies: project.dependencies || {},
  hasZip: Boolean(project.zipPath),
  currentVersion: project.currentVersion || 0,
  lastActivityAt: project.lastActivityAt,
});

// POST /api/ai-studio/session
// Opens a new AI Studio project, or resumes one the authenticated user
// already owns (never trusts a client-supplied userId — req.userId comes
// from the auth middleware only).
exports.openSession = async (req, res) => {
  try {
    const { sessionId, projectId, websiteType } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

    const project = await lifecycle.openSession({ userId: req.userId, sessionId, projectId, websiteType });
    res.status(200).json({ success: true, data: serializeProject(project) });
  } catch (error) {
    console.error('AI Studio openSession error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to open AI Studio session' });
  }
};

// POST /api/ai-studio/:projectId/heartbeat
exports.heartbeat = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });
    const project = await lifecycle.heartbeat({ projectId: req.params.projectId, userId: req.userId, sessionId });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: { lastActivityAt: project.lastActivityAt } });
  } catch (error) {
    console.error('AI Studio heartbeat error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to record heartbeat' });
  }
};

// POST /api/ai-studio/:projectId/activity — explicit meaningful action ping
// (used for actions that don't otherwise call into this module, e.g.
// "download project" from the frontend).
exports.recordActivity = async (req, res) => {
  try {
    const project = await lifecycle.recordActivity({ projectId: req.params.projectId, userId: req.userId });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: { lastActivityAt: project.lastActivityAt } });
  } catch (error) {
    console.error('AI Studio recordActivity error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to record activity' });
  }
};

// POST /api/ai-studio/:projectId/sync
// Called after an AI generation/edit result comes back, so the persisted
// project (and its zip in Supabase) reflect the latest generated files.
exports.syncFiles = async (req, res) => {
  try {
    const { files, dependencies, title, source, label } = req.body;
    const project = await lifecycle.syncGeneratedFiles({
      projectId: req.params.projectId,
      userId: req.userId,
      files,
      dependencies,
      title,
      source: ['generate', 'edit'].includes(source) ? source : 'sync',
      label: typeof label === 'string' ? label : '',
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: serializeProject(project) });
  } catch (error) {
    console.error('AI Studio syncFiles error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to save project state' });
  }
};

// GET /api/ai-studio/:projectId/versions — newest first, without file contents
exports.listVersions = async (req, res) => {
  try {
    const result = await lifecycle.listVersions({ projectId: req.params.projectId, userId: req.userId });
    if (!result) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('AI Studio listVersions error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load version history' });
  }
};

// GET /api/ai-studio/:projectId/versions/:version — full snapshot
exports.getVersion = async (req, res) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ success: false, message: 'Invalid version' });
    const snapshot = await lifecycle.getVersion({ projectId: req.params.projectId, userId: req.userId, version });
    if (!snapshot) return res.status(404).json({ success: false, message: 'Version not found' });
    res.status(200).json({ success: true, data: snapshot });
  } catch (error) {
    console.error('AI Studio getVersion error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load version' });
  }
};

// POST /api/ai-studio/:projectId/versions/:version/restore
exports.restoreVersion = async (req, res) => {
  try {
    const version = Number.parseInt(req.params.version, 10);
    if (!Number.isInteger(version) || version < 1) return res.status(400).json({ success: false, message: 'Invalid version' });
    const result = await lifecycle.restoreVersion({ projectId: req.params.projectId, userId: req.userId, version });
    if (!result) return res.status(404).json({ success: false, message: 'Project not found' });
    if (result.notFound) return res.status(404).json({ success: false, message: 'Version not found' });
    res.status(200).json({ success: true, data: serializeProject(result) });
  } catch (error) {
    console.error('AI Studio restoreVersion error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to restore version' });
  }
};

// GET /api/ai-studio/:projectId/download
// Streams a short-lived signed URL to the current project.zip. Never hands
// out the service-role key or a permanent public URL — the bucket is
// private and every access goes through this authenticated, ownership-checked
// route.
exports.downloadProject = async (req, res) => {
  try {
    const project = await lifecycle.getOwnedProject(req.params.projectId, req.userId);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!project.zipPath) return res.status(404).json({ success: false, message: 'Project has not been generated yet' });

    const signedUrl = await storage.createSignedZipUrl(project.zipPath);
    await lifecycle.recordActivity({ projectId: project._id, userId: req.userId });
    res.status(200).json({ success: true, data: { url: signedUrl } });
  } catch (error) {
    console.error('AI Studio downloadProject error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to prepare download' });
  }
};

const { classifyKind } = require('../../services/ai-studio/aiStudioAssetContract');

// Keeps `_id` (existing consumers) and adds the canonical `assetId` + server-detected `kind`.
const serializeAsset = (asset) => {
  const o = asset.toObject ? asset.toObject() : asset;
  return { ...o, assetId: String(o._id), kind: classifyKind(o.mimeType, o.fileName) };
};

// POST /api/ai-studio/:projectId/assets (multer buffer upload expected on req.file)
exports.uploadAsset = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const asset = await lifecycle.addAsset({
      projectId: req.params.projectId,
      userId: req.userId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Project not found' });
    res.status(201).json({ success: true, data: serializeAsset(asset) });
  } catch (error) {
    console.error('AI Studio uploadAsset error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to upload asset' });
  }
};

// DELETE /api/ai-studio/:projectId/assets/:assetId
exports.deleteAsset = async (req, res) => {
  try {
    const removed = await lifecycle.removeAsset({
      projectId: req.params.projectId,
      userId: req.userId,
      assetId: req.params.assetId,
    });
    if (!removed) return res.status(404).json({ success: false, message: 'Asset not found' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('AI Studio deleteAsset error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete asset' });
  }
};

// POST /api/ai-studio/:projectId/close — a single tab telling the backend
// it is no longer keeping this project's session alive (best-effort signal
// only, see docs — inactivity cleanup is the real safety net).
exports.closeSessionTab = async (req, res) => {
  try {
    const { sessionId } = req.body;
    await lifecycle.deleteSessionTab({ projectId: req.params.projectId, userId: req.userId, sessionId });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(200).json({ success: true }); // best-effort; never block unload
  }
};
