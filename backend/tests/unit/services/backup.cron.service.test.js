jest.mock('../../../src/services/backup/backup.orchestrator');

const orchestrator = require('../../../src/services/backup/backup.orchestrator');
const { runScheduledBackup, startBackupCron } = require('../../../src/services/backup.cron.service');

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

  describe('startBackupCron', () => {
    it('uses setInterval on BACKUP_INTERVAL_HOURS when configured, without running immediately', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      process.env.BACKUP_INTERVAL_HOURS = '6';
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: false });
      orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });

      startBackupCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 6 * 60 * 60 * 1000);
      expect(orchestrator.runFullBackup).not.toHaveBeenCalled();
      jest.clearAllTimers();
    });

    it('accepts a fractional BACKUP_INTERVAL_HOURS (e.g. every 30 minutes)', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      process.env.BACKUP_INTERVAL_HOURS = '0.5';

      startBackupCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 0.5 * 60 * 60 * 1000);
      jest.clearAllTimers();
    });

    it('falls back to BACKUP_CRON_SCHEDULE (exact cron syntax) when no interval hours is set', () => {
      const cron = require('node-cron');
      const scheduleSpy = jest.spyOn(cron, 'schedule').mockImplementation(() => ({ stop: jest.fn() }));
      process.env.BACKUP_CRON_SCHEDULE = '0 2 * * *';
      process.env.CRON_TIMEZONE = 'America/New_York';

      startBackupCron();

      expect(scheduleSpy).toHaveBeenCalledWith('0 2 * * *', expect.any(Function), { timezone: 'America/New_York' });
      scheduleSpy.mockRestore();
    });

    it('prioritizes BACKUP_INTERVAL_HOURS over BACKUP_CRON_SCHEDULE when both are set', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const cron = require('node-cron');
      const scheduleSpy = jest.spyOn(cron, 'schedule');
      process.env.BACKUP_INTERVAL_HOURS = '12';
      process.env.BACKUP_CRON_SCHEDULE = '0 2 * * *';

      startBackupCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 12 * 60 * 60 * 1000);
      expect(scheduleSpy).not.toHaveBeenCalled();
      jest.clearAllTimers();
      scheduleSpy.mockRestore();
    });

    it('defaults to a 24-hour interval when nothing is configured', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      startBackupCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000);
      jest.clearAllTimers();
    });

    it('ignores a non-numeric BACKUP_INTERVAL_HOURS and falls through to the default', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      process.env.BACKUP_INTERVAL_HOURS = 'not-a-number';

      startBackupCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 24 * 60 * 60 * 1000);
      jest.clearAllTimers();
    });
  });
});
