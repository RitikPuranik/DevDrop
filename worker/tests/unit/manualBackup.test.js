jest.mock('../../../backend/src/services/backup/backup.orchestrator');

const orchestrator = require('../../../backend/src/services/backup/backup.orchestrator');
const { runManualBackup, runScheduledBackup } = require('../../src/jobs/backup.cron.service');
const { handlers } = require('../../src/handlers');

describe('runManualBackup (worker)', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

  it('runs a full backup with manual trigger and the requesting admin', async () => {
    orchestrator.runFullBackup.mockResolvedValue({ status: 'success', mongo: { success: true }, supabase: { success: true }, durationMs: 5 });
    const result = await runManualBackup({ kind: 'full', direction: 'backup_to_main', mode: 'merge', supabaseMode: 'add-only', triggeredBy: 'admin1' });
    expect(orchestrator.runFullBackup).toHaveBeenCalledWith({ direction: 'backup_to_main', trigger: 'manual', triggeredBy: 'admin1', mode: 'merge', supabaseMode: 'add-only' });
    expect(result.status).toBe('success');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Manual full backup finished'));
  });

  it('runs mongo-only and supabase-only kinds', async () => {
    orchestrator.runMongoBackup.mockResolvedValue({ success: true });
    orchestrator.runSupabaseBackup.mockResolvedValue({ success: true, failed: [] });
    await runManualBackup({ kind: 'mongo' });
    await runManualBackup({ kind: 'supabase' });
    expect(orchestrator.runMongoBackup).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', mode: 'replace' }));
    expect(orchestrator.runSupabaseBackup).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual', supabaseMode: 'mirror' }));
  });

  it('throws and logs the real error when a leg fails, so the task is reported failed', async () => {
    orchestrator.runMongoBackup.mockRejectedValue(new Error('auth failed for backup cluster'));
    await expect(runManualBackup({ kind: 'mongo' })).rejects.toThrow('auth failed for backup cluster');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('auth failed for backup cluster'));
  });

  it('fails a full backup whose overall status is failed, including both leg errors', async () => {
    orchestrator.runFullBackup.mockResolvedValue({ status: 'failed', mongo: { success: false, error: 'm-err' }, supabase: { success: false, error: 's-err' } });
    await expect(runManualBackup({ kind: 'full' })).rejects.toThrow(/mongo: m-err; supabase: s-err/);
  });

  it('rejects invalid input before touching the orchestrator', async () => {
    await expect(runManualBackup({ kind: 'nope' })).rejects.toThrow('Invalid backup kind');
    await expect(runManualBackup({ kind: 'full', direction: 'x' })).rejects.toThrow('Invalid direction');
    await expect(runManualBackup({ kind: 'full', supabaseMode: 'x' })).rejects.toThrow('Invalid supabaseMode');
    expect(orchestrator.runFullBackup).not.toHaveBeenCalled();
  });

  it('refuses to overlap with a running backup, and frees the guard afterwards', async () => {
    let finish;
    orchestrator.runFullBackup.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    const first = runManualBackup({ kind: 'full' });
    await expect(runManualBackup({ kind: 'full' })).rejects.toThrow('already running');

    orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: true });
    await runScheduledBackup(); // scheduled run is skipped by the same guard
    expect(orchestrator.runFullBackup).toHaveBeenCalledTimes(1);

    finish({ status: 'success' });
    await first;
    orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });
    await expect(runManualBackup({ kind: 'full' })).resolves.toBeDefined();
  });

  it('RUN_BACKUP handler uses the manual path when payload.kind is present', async () => {
    orchestrator.runMongoBackup.mockResolvedValue({ success: true });
    await handlers.RUN_BACKUP({ kind: 'mongo' });
    expect(orchestrator.runMongoBackup).toHaveBeenCalled();
  });
});
