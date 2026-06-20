const cron = require('node-cron');
const { runFullBackup, isBackupTargetConfigured } = require('./backup/backup.orchestrator');

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
    console.log(`✅ Scheduled backup finished with status: ${result.status}`);
  } catch (error) {
    console.error('Scheduled backup cron error:', error);
  } finally {
    backupRunning = false;
  }
};

/**
 * Reads the backup schedule from .env at server startup.
 *
 * Two ways to configure it (pick one):
 *  - BACKUP_INTERVAL_HOURS=6   -> simplest option: "run every N hours".
 *    Accepts decimals too (e.g. 0.5 for every 30 minutes).
 *  - BACKUP_CRON_SCHEDULE="0 2 * * *" -> exact cron syntax, for people
 *    who want a specific time of day rather than a fixed interval.
 *
 * If both are set, BACKUP_INTERVAL_HOURS takes priority since it's the
 * simpler, more commonly requested option.
 * If neither is set, defaults to every 24 hours.
 */
const startBackupCron = () => {
  const intervalHoursRaw = process.env.BACKUP_INTERVAL_HOURS;
  const intervalHours = parseFloat(intervalHoursRaw);

  if (intervalHoursRaw && !isNaN(intervalHours) && intervalHours > 0) {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    setInterval(runScheduledBackup, intervalMs);
    console.log(`✅ Backup cron started — runs every ${intervalHours} hour(s) (BACKUP_INTERVAL_HOURS)`);
    return;
  }

  if (process.env.BACKUP_CRON_SCHEDULE) {
    const schedule = process.env.BACKUP_CRON_SCHEDULE;
    cron.schedule(schedule, runScheduledBackup, { timezone: process.env.CRON_TIMEZONE || 'UTC' });
    console.log(`✅ Backup cron started (cron schedule: ${schedule})`);
    return;
  }

  // Default: once every 24 hours if nothing is configured
  const defaultHours = 24;
  setInterval(runScheduledBackup, defaultHours * 60 * 60 * 1000);
  console.log(`✅ Backup cron started — runs every ${defaultHours} hour(s) (default, set BACKUP_INTERVAL_HOURS to change)`);
};

module.exports = { startBackupCron, runScheduledBackup };
