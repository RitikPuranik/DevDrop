const {
  testEndpointConnections,
  isBackupTargetConfigured,
  getScheduleInfo,
  getRecentLogs,
} = require('../../services/backup/backup.orchestrator');
const { dispatchTask } = require('../../services/worker.client');
const taskRegistry = require('../../services/taskRegistry.service');

const VALID_DIRECTIONS = ['main_to_backup', 'backup_to_main'];
const VALID_SUPABASE_MODES = ['mirror', 'add-only'];
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 100;

const parseDirection = (req) => {
  const direction = req.body?.direction || 'main_to_backup';
  if (!VALID_DIRECTIONS.includes(direction)) {
    throw new Error("Invalid direction. Use 'main_to_backup' or 'backup_to_main'.");
  }
  return direction;
};

const parseSupabaseMode = (req) => {
  const mode = req.body?.supabaseMode || 'mirror';
  if (!VALID_SUPABASE_MODES.includes(mode)) {
    throw new Error("Invalid supabaseMode. Use 'mirror' (default, deletes stale files) or 'add-only'.");
  }
  return mode;
};

/**
 * GET /api/admin/backup/status
 * Reports whether backup credentials are configured and tests both
 * endpoints' reachability.
 */
const getStatus = async (req, res) => {
  try {
    const configured = isBackupTargetConfigured();
    const connections = await testEndpointConnections();
    const schedule = getScheduleInfo();
    res.json({ success: true, data: { configured, connections, schedule } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to check backup status', error: error.message });
  }
};

/**
 * GET /api/admin/backup/history
 */
const getHistory = async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedPage = Number.parseInt(req.query.page, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const { type, from, to } = req.query;
    const paginatedData = await getRecentLogs({ limit, page, type, from, to });
    res.json({ success: true, data: paginatedData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load backup history', error: error.message });
  }
};

/**
 * Hands a backup/restore run to the Worker. The Backend never runs the copy
 * itself: it validates, dispatches a signed task, and answers 202 right away.
 * The outcome is written to the backup history (BackupLog) by the Worker and
 * can also be polled via GET /api/admin/backup/task/:taskId.
 */
const dispatchBackup = async (res, { kind, label, params }) => {
  try {
    const { taskId } = await dispatchTask('RUN_BACKUP', { kind, ...params });
    res.status(202).json({
      success: true,
      message: `${label} started in the background worker. Check backup history for the result.`,
      data: { taskId, status: 'queued' },
    });
  } catch (error) {
    console.error(`❌ Could not hand ${label.toLowerCase()} to the worker: ${error.message}`);
    res.status(503).json({ success: false, message: `Worker unavailable — ${label.toLowerCase()} was not started (${error.message})` });
  }
};

/**
 * POST /api/admin/backup/mongo
 * body: { direction: 'main_to_backup' | 'backup_to_main', mode: 'replace' | 'merge' }
 */
const backupMongo = async (req, res) => {
  let params;
  try {
    params = {
      direction: parseDirection(req),
      mode: req.body?.mode === 'merge' ? 'merge' : 'replace',
      triggeredBy: req.userId,
    };
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return dispatchBackup(res, { kind: 'mongo', label: 'MongoDB sync', params });
};

/**
 * POST /api/admin/backup/supabase
 * body: { direction: 'main_to_backup' | 'backup_to_main', supabaseMode: 'mirror' | 'add-only' }
 */
const backupSupabase = async (req, res) => {
  let params;
  try {
    params = {
      direction: parseDirection(req),
      supabaseMode: parseSupabaseMode(req),
      triggeredBy: req.userId,
    };
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return dispatchBackup(res, { kind: 'supabase', label: 'Supabase storage sync', params });
};

/**
 * POST /api/admin/backup/full
 * body: { direction, mode, supabaseMode }
 * Runs Mongo + Supabase together. Used for both "Backup Now" (main -> backup)
 * and "Restore" (backup -> main).
 */
const backupFull = async (req, res) => {
  let params;
  let label;
  try {
    const direction = parseDirection(req);
    params = {
      direction,
      mode: req.body?.mode === 'merge' ? 'merge' : 'replace',
      supabaseMode: parseSupabaseMode(req),
      triggeredBy: req.userId,
    };
    label = direction === 'backup_to_main' ? 'Restore from backup' : 'Backup';
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return dispatchBackup(res, { kind: 'full', label, params });
};

/**
 * GET /api/admin/backup/task/:taskId
 * Live status of a dispatched backup (queued | running | completed | failed).
 */
const getTaskStatus = (req, res) => {
  const task = taskRegistry.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found (it may have expired or the backend restarted)' });
  }
  const { taskId, type, status, result, error, createdAt, updatedAt } = task;
  res.json({ success: true, data: { taskId, type, status, result, error, createdAt, updatedAt } });
};

module.exports = { getStatus, getHistory, backupMongo, backupSupabase, backupFull, getTaskStatus };
