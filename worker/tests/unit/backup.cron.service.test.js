jest.mock('../../../backend/src/services/backup/backup.orchestrator');

const orchestrator = require('../../../backend/src/services/backup/backup.orchestrator');
const { runScheduledBackup } = require('../../src/jobs/backup.cron.service');

const ORIGINAL_ENV = process.env;

describe('backup.cron.service', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BACKUP_INTERVAL_HOURS;
    delete process.env.BACKUP_CRON_SCHEDULE;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('runScheduledBackup', () => {
    it('skips the run when neither backup target is configured', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: false, supabaseConfigured: false });
      orchestrator.runFullBackup.mockResolvedValue({ status: 'skipped-not-expected' });

      await runScheduledBackup();

      expect(orchestrator.runFullBackup).not.toHaveBeenCalled();
    });

    it('runs a main-to-backup replace/mirror backup when a target is configured', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });

      await runScheduledBackup();

      expect(orchestrator.runFullBackup).toHaveBeenCalledWith({
        direction: 'main_to_backup',
        trigger: 'scheduled',
        mode: 'replace',
        supabaseMode: 'mirror',
      });
    });

    it('logs and swallows an error from the backup run instead of throwing', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      orchestrator.runFullBackup.mockRejectedValue(new Error('mongodump failed'));

      await expect(runScheduledBackup()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Scheduled backup cron error:', expect.any(Error));
    });

    it('does not run a second backup concurrently while one is still in flight', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      let resolveFirst;
      orchestrator.runFullBackup.mockReturnValue(new Promise((resolve) => { resolveFirst = resolve; }));

      const firstRun = runScheduledBackup();
      // Started while the first run's promise is still pending.
      await runScheduledBackup();

      expect(orchestrator.runFullBackup).toHaveBeenCalledTimes(1);

      resolveFirst({ status: 'success' });
      await firstRun;
    });

    it('allows a new run once the in-flight run has finished (the busy flag is cleared)', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });

      await runScheduledBackup();
      await runScheduledBackup();

      expect(orchestrator.runFullBackup).toHaveBeenCalledTimes(2);
    });

    it('clears the busy flag even when the backup run throws, so the next tick is not skipped', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      orchestrator.runFullBackup.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ status: 'success' });

      await runScheduledBackup();
      await runScheduledBackup();

      expect(orchestrator.runFullBackup).toHaveBeenCalledTimes(2);
    });
  });
});
