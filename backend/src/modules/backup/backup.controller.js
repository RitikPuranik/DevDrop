const {
  runMongoBackup,
  runSupabaseBackup,
  runFullBackup,
  testEndpointConnections,
  isBackupTargetConfigured,
  getScheduleInfo,
  getRecentLogs,
} = require('../../services/backup/backup.orchestrator');

const VALID_DIRECTIONS = ['main_to_backup', 'backup_to_main'];
const VALID_SUPABASE_MODES = ['mirror', 'add-only'];

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
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { type, from, to } = req.query;
    const logs = await getRecentLogs({ limit, type, from, to });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load backup history', error: error.message });
  }
};

/**
 * POST /api/admin/backup/mongo
 * body: { direction: 'main_to_backup' | 'backup_to_main', mode: 'replace' | 'merge' }
 */
const backupMongo = async (req, res) => {
  try {
    const direction = parseDirection(req);
    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';

    const result = await runMongoBackup({ direction, trigger: 'manual', triggeredBy: req.userId, mode });
    res.json({ success: true, message: 'MongoDB sync completed', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'MongoDB sync failed' });
  }
};

/**
 * POST /api/admin/backup/supabase
 * body: { direction: 'main_to_backup' | 'backup_to_main', supabaseMode: 'mirror' | 'add-only' }
 */
const backupSupabase = async (req, res) => {
  try {
    const direction = parseDirection(req);
    const supabaseMode = parseSupabaseMode(req);

    const result = await runSupabaseBackup({ direction, trigger: 'manual', triggeredBy: req.userId, supabaseMode });
    res.json({ success: true, message: 'Supabase storage sync completed', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Supabase storage sync failed' });
  }
};

/**
 * POST /api/admin/backup/full
 * body: { direction, mode, supabaseMode }
 * Runs Mongo + Supabase together. Used for both "Backup Now" (main -> backup)
 * and "Restore" (backup -> main).
 */
const backupFull = async (req, res) => {
  try {
    const direction = parseDirection(req);
    const mode = req.body?.mode === 'merge' ? 'merge' : 'replace';
    const supabaseMode = parseSupabaseMode(req);

    const result = await runFullBackup({ direction, trigger: 'manual', triggeredBy: req.userId, mode, supabaseMode });

    const statusCode = result.status === 'failed' ? 500 : 200;
    res.status(statusCode).json({
      success: result.status !== 'failed',
      message:
        direction === 'backup_to_main'
          ? `Restore from backup ${result.status === 'success' ? 'completed' : result.status}`
          : `Backup ${result.status === 'success' ? 'completed' : result.status}`,
      data: result,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Backup/restore failed' });
  }
};

module.exports = { getStatus, getHistory, backupMongo, backupSupabase, backupFull };
