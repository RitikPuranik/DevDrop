const {
  runFullBackup,
  runMongoBackup,
  runSupabaseBackup,
  isBackupTargetConfigured,
} = require('../../../backend/src/services/backup/backup.orchestrator');

let backupRunning = false;

const runScheduledBackup = async () => {
  const { mongoConfigured, supabaseConfigured } = isBackupTargetConfigured();

  if (!mongoConfigured && !supabaseConfigured) {
    console.log('ℹ️  Scheduled backup skipped: no BACKUP_MONGODB_URI or BACKUP_SUPABASE_* credentials configured');
    return;
  }

  if (backupRunning) {
    console.log('ℹ️  Scheduled backup skipped because a previous run is still active');
    return;
  }

  backupRunning = true;

  try {
    console.log('💾 Starting scheduled backup (main → backup)');
    // mode: 'replace'  -> Mongo target collections are wiped and re-filled from main,
    //                     so they never just keep accumulating old/duplicate documents.
    // supabaseMode: 'mirror' -> backup bucket ends up exactly matching main's bucket,
    //                           deleting files on backup that were removed from main.
    const result = await runFullBackup({
      direction: 'main_to_backup',
      trigger: 'scheduled',
      mode: 'replace',
      supabaseMode: 'mirror',
    });
    console.log(`✅ Scheduled backup finished: ${describeOutcome(result)}`);
  } catch (error) {
    console.error('Scheduled backup cron error:', error);
  } finally {
    backupRunning = false;
  }
};

const VALID_KINDS = ['full', 'mongo', 'supabase'];
const VALID_DIRECTIONS = ['main_to_backup', 'backup_to_main'];
const VALID_SUPABASE_MODES = ['mirror', 'add-only'];

// Human-readable one-liner of a backup/restore result, for the worker logs.
const describeOutcome = (result) => {
  const parts = [];
  if (result.status) parts.push(`status=${result.status}`);
  if (result.mongo) parts.push(`mongo=${result.mongo.success ? 'ok' : `FAILED (${result.mongo.error})`}`);
  if (result.supabase) parts.push(`supabase=${result.supabase.success ? 'ok' : `FAILED (${result.supabase.error})`}`);
  if (Array.isArray(result.failed) && result.failed.length > 0) parts.push(`${result.failed.length} file(s) failed`);
  if (result.durationMs !== undefined) parts.push(`${result.durationMs}ms`);
  return parts.join(', ');
};

/**
 * Manual backup/restore dispatched by the Backend (admin panel).
 * Shares the same "already running" guard as the scheduled backup so a manual
 * run and a scheduled run can never overlap. Throws on failure so the task is
 * reported back to the Backend as "failed" with the error message.
 * payload: { kind: 'full'|'mongo'|'supabase', direction, mode, supabaseMode, triggeredBy }
 */
const runManualBackup = async (payload = {}) => {
  const kind = payload.kind;
  const direction = payload.direction || 'main_to_backup';
  const supabaseMode = payload.supabaseMode || 'mirror';
  const mode = payload.mode === 'merge' ? 'merge' : 'replace';

  if (!VALID_KINDS.includes(kind)) throw new Error(`Invalid backup kind: ${kind}`);
  if (!VALID_DIRECTIONS.includes(direction)) throw new Error(`Invalid direction: ${direction}`);
  if (!VALID_SUPABASE_MODES.includes(supabaseMode)) throw new Error(`Invalid supabaseMode: ${supabaseMode}`);

  if (backupRunning) {
    throw new Error('Another backup is already running — try again when it finishes');
  }
  backupRunning = true;

  const args = { direction, trigger: 'manual', triggeredBy: payload.triggeredBy || null };
  console.log(`💾 Manual ${kind} backup started (${direction}${kind !== 'supabase' ? `, mongo mode=${mode}` : ''}${kind !== 'mongo' ? `, supabase mode=${supabaseMode}` : ''})`);

  try {
    let result;
    if (kind === 'mongo') result = await runMongoBackup({ ...args, mode });
    else if (kind === 'supabase') result = await runSupabaseBackup({ ...args, supabaseMode });
    else result = await runFullBackup({ ...args, mode, supabaseMode });

    if (kind === 'full' && result.status === 'failed') {
      const detail = [result.mongo?.error && `mongo: ${result.mongo.error}`, result.supabase?.error && `supabase: ${result.supabase.error}`]
        .filter(Boolean)
        .join('; ');
      throw new Error(`Backup failed (${detail || 'unknown error'})`);
    }

    console.log(`✅ Manual ${kind} backup finished: ${describeOutcome(result)}`);
    return result;
  } catch (error) {
    console.error(`❌ Manual ${kind} backup failed: ${error.message}`);
    throw error;
  } finally {
    backupRunning = false;
  }
};


module.exports = { runScheduledBackup, runManualBackup };
