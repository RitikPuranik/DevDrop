const mongoBackup = require('./mongoBackup.service');
const supabaseBackup = require('./supabaseBackup.service');
const BackupLog = require('../../modules/backup/backupLog.model');

/**
 * Resolve the four credential sets involved in any backup/restore run.
 * "main" = the live app's current database/storage (from process.env).
 * "backup" = the admin-provided secondary database/storage.
 */
const getEndpoints = () => ({
  main: {
    mongoUri: process.env.MONGODB_URI,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.SUPABASE_BUCKET_NAME || 'marketplace-files',
  },
  backup: {
    mongoUri: process.env.BACKUP_MONGODB_URI,
    supabaseUrl: process.env.BACKUP_SUPABASE_URL,
    supabaseKey: process.env.BACKUP_SUPABASE_SERVICE_ROLE_KEY,
    supabaseBucket: process.env.BACKUP_SUPABASE_BUCKET_NAME || process.env.SUPABASE_BUCKET_NAME || 'marketplace-files',
  },
});

const isBackupTargetConfigured = () => {
  const { backup } = getEndpoints();
  return {
    mongoConfigured: Boolean(backup.mongoUri),
    supabaseConfigured: Boolean(backup.supabaseUrl && backup.supabaseKey),
  };
};

/** Describes the currently active cron schedule, for display in the admin UI. */
const getScheduleInfo = () => {
  const intervalHoursRaw = process.env.BACKUP_INTERVAL_HOURS;
  const intervalHours = parseFloat(intervalHoursRaw);

  if (intervalHoursRaw && !isNaN(intervalHours) && intervalHours > 0) {
    return { mode: 'interval', intervalHours, label: `Every ${intervalHours} hour${intervalHours === 1 ? '' : 's'}` };
  }

  if (process.env.BACKUP_CRON_SCHEDULE) {
    return { mode: 'cron', schedule: process.env.BACKUP_CRON_SCHEDULE, label: `Cron: ${process.env.BACKUP_CRON_SCHEDULE}` };
  }

  return { mode: 'default', intervalHours: 24, label: 'Every 24 hours (default)' };
};

const directionToEndpoints = (direction) => {
  const { main, backup } = getEndpoints();
  return direction === 'backup_to_main' ? { source: backup, target: main } : { source: main, target: backup };
};

const writeLog = async ({ type, direction, trigger, status, triggeredBy, summary, errorMessage, durationMs }) => {
  try {
    await BackupLog.create({ type, direction, trigger, status, triggeredBy, summary, errorMessage, durationMs });
  } catch (err) {
    // Logging must never crash a backup run
    console.error('Failed to write backup log:', err.message);
  }
};

/**
 * Run a MongoDB copy in the given direction and log the result.
 */
const runMongoBackup = async ({ direction = 'main_to_backup', trigger = 'manual', triggeredBy = null, mode = 'replace', skipLog = false } = {}) => {
  const { source, target } = directionToEndpoints(direction);
  const start = Date.now();

  try {
    const result = await mongoBackup.copyDatabase(source.mongoUri, target.mongoUri, {
      sourceLabel: direction === 'backup_to_main' ? 'backup' : 'main',
      targetLabel: direction === 'backup_to_main' ? 'main' : 'backup',
      mode,
    });

    const durationMs = Date.now() - start;
    if (!skipLog) {
      await writeLog({ type: 'mongo', direction, trigger, status: 'success', triggeredBy, summary: result, durationMs });
    }
    return { success: true, ...result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (!skipLog) {
      await writeLog({ type: 'mongo', direction, trigger, status: 'failed', triggeredBy, errorMessage: error.message, durationMs });
    }
    throw error;
  }
};

/**
 * Run a Supabase storage mirror in the given direction and log the result.
 * supabaseMode 'mirror' (default) makes target match source exactly,
 * deleting files on target that no longer exist on source — this is
 * what stops the backup bucket from growing forever.
 */
const runSupabaseBackup = async ({ direction = 'main_to_backup', trigger = 'manual', triggeredBy = null, supabaseMode = 'mirror', skipLog = false } = {}) => {
  const { source, target } = directionToEndpoints(direction);
  const start = Date.now();

  try {
    const result = await supabaseBackup.mirrorBucket({
      sourceUrl: source.supabaseUrl,
      sourceKey: source.supabaseKey,
      sourceBucket: source.supabaseBucket,
      targetUrl: target.supabaseUrl,
      targetKey: target.supabaseKey,
      targetBucket: target.supabaseBucket,
      mode: supabaseMode,
    });

    const durationMs = Date.now() - start;
    const status = result.failed.length > 0 ? 'partial' : 'success';
    if (!skipLog) {
      await writeLog({ type: 'supabase', direction, trigger, status, triggeredBy, summary: result, durationMs });
    }
    return { success: true, ...result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (!skipLog) {
      await writeLog({ type: 'supabase', direction, trigger, status: 'failed', triggeredBy, errorMessage: error.message, durationMs });
    }
    throw error;
  }
};

/**
 * Run both Mongo + Supabase in the given direction. Each leg is
 * independent — if one fails the other still runs, and the combined
 * result reports both outcomes.
 */
const runFullBackup = async ({ direction = 'main_to_backup', trigger = 'manual', triggeredBy = null, mode = 'replace', supabaseMode = 'mirror' } = {}) => {
  const start = Date.now();
  const outcome = { mongo: null, supabase: null };
  let overallStatus = 'success';

  try {
    outcome.mongo = await runMongoBackup({ direction, trigger, triggeredBy, mode, skipLog: true });
  } catch (error) {
    outcome.mongo = { success: false, error: error.message };
    overallStatus = 'partial';
  }

  try {
    outcome.supabase = await runSupabaseBackup({ direction, trigger, triggeredBy, supabaseMode, skipLog: true });
  } catch (error) {
    outcome.supabase = { success: false, error: error.message };
    overallStatus = outcome.mongo?.success === false ? 'failed' : 'partial';
  }

  const durationMs = Date.now() - start;
  await writeLog({ type: 'full', direction, trigger, status: overallStatus, triggeredBy, summary: outcome, durationMs });

  return { status: overallStatus, ...outcome, durationMs };
};

const testEndpointConnections = async () => {
  const { main, backup } = getEndpoints();
  const results = { main: {}, backup: {} };

  results.main.mongo = await safe(() => mongoBackup.testConnection(main.mongoUri, 'main'));
  results.main.supabase = await safe(() => supabaseBackup.testConnection(main.supabaseUrl, main.supabaseKey, main.supabaseBucket));
  results.backup.mongo = await safe(() => mongoBackup.testConnection(backup.mongoUri, 'backup'));
  results.backup.supabase = await safe(() => supabaseBackup.testConnection(backup.supabaseUrl, backup.supabaseKey, backup.supabaseBucket));

  return results;
};

const safe = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

const getRecentLogs = async ({ limit = 20, type, from, to } = {}) => {
  const filter = {};
  if (type && ['mongo', 'supabase', 'full'].includes(type)) {
    filter.type = type;
  }
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  return BackupLog.find(filter).sort({ createdAt: -1 }).limit(limit).populate('triggeredBy', 'name email').lean();
};

module.exports = {
  runMongoBackup,
  runSupabaseBackup,
  runFullBackup,
  testEndpointConnections,
  isBackupTargetConfigured,
  getScheduleInfo,
  getRecentLogs,
};
