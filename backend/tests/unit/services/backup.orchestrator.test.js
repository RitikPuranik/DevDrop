// Real orchestrator coordination logic under test. The lower-level
// backup services and the log model are external boundaries and are
// mocked — no real Mongo/Supabase operations occur.
jest.mock('../../../src/services/backup/mongoBackup.service');
jest.mock('../../../src/services/backup/supabaseBackup.service');
jest.mock('../../../src/modules/backup/backupLog.model');

const mongoBackup = require('../../../src/services/backup/mongoBackup.service');
const supabaseBackup = require('../../../src/services/backup/supabaseBackup.service');
const BackupLog = require('../../../src/modules/backup/backupLog.model');
const orchestrator = require('../../../src/services/backup/backup.orchestrator');

const ENV_KEYS = [
  'MONGODB_URI', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_BUCKET_NAME',
  'BACKUP_MONGODB_URI', 'BACKUP_SUPABASE_URL', 'BACKUP_SUPABASE_SERVICE_ROLE_KEY', 'BACKUP_SUPABASE_BUCKET_NAME',
  'BACKUP_INTERVAL_HOURS', 'BACKUP_CRON_SCHEDULE',
];

const setEnv = (values) => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
  Object.assign(process.env, values);
};

describe('backup.orchestrator', () => {
  beforeEach(() => {
    setEnv({
      MONGODB_URI: 'mongodb://main',
      SUPABASE_URL: 'https://main.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'main-key',
      BACKUP_MONGODB_URI: 'mongodb://backup',
      BACKUP_SUPABASE_URL: 'https://backup.supabase.co',
      BACKUP_SUPABASE_SERVICE_ROLE_KEY: 'backup-key',
    });
    BackupLog.create = jest.fn().mockResolvedValue({});
  });

  afterAll(() => {
    ENV_KEYS.forEach((key) => delete process.env[key]);
  });

  describe('isBackupTargetConfigured', () => {
    it('reports both configured when backup env vars are present', () => {
      expect(orchestrator.isBackupTargetConfigured()).toEqual({ mongoConfigured: true, supabaseConfigured: true });
    });

    it('reports unconfigured when backup env vars are missing', () => {
      setEnv({ MONGODB_URI: 'mongodb://main' });
      expect(orchestrator.isBackupTargetConfigured()).toEqual({ mongoConfigured: false, supabaseConfigured: false });
    });
  });

  describe('getScheduleInfo', () => {
    it('returns the default 24h schedule when nothing is configured', () => {
      expect(orchestrator.getScheduleInfo()).toEqual({ mode: 'default', intervalHours: 24, label: 'Every 24 hours (default)' });
    });

    it('prefers a configured interval over the default', () => {
      process.env.BACKUP_INTERVAL_HOURS = '6';
      expect(orchestrator.getScheduleInfo()).toEqual({ mode: 'interval', intervalHours: 6, label: 'Every 6 hours' });
    });

    it('singularizes the label for a 1 hour interval', () => {
      process.env.BACKUP_INTERVAL_HOURS = '1';
      expect(orchestrator.getScheduleInfo().label).toBe('Every 1 hour');
    });

    it('falls back to a cron schedule when interval is invalid', () => {
      process.env.BACKUP_INTERVAL_HOURS = 'not-a-number';
      process.env.BACKUP_CRON_SCHEDULE = '0 */6 * * *';
      expect(orchestrator.getScheduleInfo()).toEqual({ mode: 'cron', schedule: '0 */6 * * *', label: 'Cron: 0 */6 * * *' });
    });
  });

  describe('runMongoBackup', () => {
    it('runs the copy, writes a success log, and returns the result', async () => {
      mongoBackup.copyDatabase.mockResolvedValue({ collections: { users: 2 } });

      const result = await orchestrator.runMongoBackup({ triggeredBy: 'admin-1' });

      expect(mongoBackup.copyDatabase).toHaveBeenCalledWith('mongodb://main', 'mongodb://backup', {
        sourceLabel: 'main', targetLabel: 'backup', mode: 'replace',
      });
      expect(result).toEqual({ success: true, collections: { users: 2 }, durationMs: expect.any(Number) });
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'mongo', status: 'success', triggeredBy: 'admin-1' }));
    });

    it('resolves source/target the other way for backup_to_main', async () => {
      mongoBackup.copyDatabase.mockResolvedValue({});

      await orchestrator.runMongoBackup({ direction: 'backup_to_main' });

      expect(mongoBackup.copyDatabase).toHaveBeenCalledWith('mongodb://backup', 'mongodb://main', {
        sourceLabel: 'backup', targetLabel: 'main', mode: 'replace',
      });
    });

    it('logs failure and rethrows when the copy fails', async () => {
      mongoBackup.copyDatabase.mockRejectedValue(new Error('connection refused'));

      await expect(orchestrator.runMongoBackup()).rejects.toThrow('connection refused');
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'mongo', status: 'failed', errorMessage: 'connection refused' }));
    });

    it('skips writing a log when skipLog is set', async () => {
      mongoBackup.copyDatabase.mockResolvedValue({});
      await orchestrator.runMongoBackup({ skipLog: true });
      expect(BackupLog.create).not.toHaveBeenCalled();
    });
  });

  describe('runSupabaseBackup', () => {
    it('runs the mirror, writes a success log when nothing failed', async () => {
      supabaseBackup.mirrorBucket.mockResolvedValue({ copied: 3, skipped: 1, deleted: 0, failed: [] });

      const result = await orchestrator.runSupabaseBackup({ triggeredBy: 'admin-1' });

      expect(supabaseBackup.mirrorBucket).toHaveBeenCalledWith(expect.objectContaining({
        sourceUrl: 'https://main.supabase.co', targetUrl: 'https://backup.supabase.co', mode: 'mirror',
      }));
      expect(result.success).toBe(true);
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'supabase', status: 'success' }));
    });

    it('logs a "partial" status when some files failed to mirror', async () => {
      supabaseBackup.mirrorBucket.mockResolvedValue({ copied: 2, failed: [{ path: 'a.zip', error: 'boom' }] });

      await orchestrator.runSupabaseBackup();

      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'supabase', status: 'partial' }));
    });

    it('logs failure and rethrows when the mirror call itself throws', async () => {
      supabaseBackup.mirrorBucket.mockRejectedValue(new Error('bucket not found'));

      await expect(orchestrator.runSupabaseBackup()).rejects.toThrow('bucket not found');
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'supabase', status: 'failed', errorMessage: 'bucket not found' }));
    });
  });

  describe('runFullBackup', () => {
    it('runs both legs, skips their individual logs, and writes one combined success log', async () => {
      mongoBackup.copyDatabase.mockResolvedValue({ ok: true });
      supabaseBackup.mirrorBucket.mockResolvedValue({ copied: 1, failed: [] });

      const result = await orchestrator.runFullBackup();

      expect(result.status).toBe('success');
      expect(result.mongo.success).toBe(true);
      expect(result.supabase.success).toBe(true);
      expect(BackupLog.create).toHaveBeenCalledTimes(1);
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'full', status: 'success' }));
    });

    it('marks the run "partial" when only mongo fails, but still runs supabase', async () => {
      mongoBackup.copyDatabase.mockRejectedValue(new Error('mongo down'));
      supabaseBackup.mirrorBucket.mockResolvedValue({ copied: 1, failed: [] });

      const result = await orchestrator.runFullBackup();

      expect(result.status).toBe('partial');
      expect(result.mongo).toEqual({ success: false, error: 'mongo down' });
      expect(result.supabase.success).toBe(true);
      expect(supabaseBackup.mirrorBucket).toHaveBeenCalled();
    });

    it('marks the run "partial" when only supabase fails', async () => {
      mongoBackup.copyDatabase.mockResolvedValue({ ok: true });
      supabaseBackup.mirrorBucket.mockRejectedValue(new Error('bucket down'));

      const result = await orchestrator.runFullBackup();

      expect(result.status).toBe('partial');
      expect(result.mongo.success).toBe(true);
      expect(result.supabase).toEqual({ success: false, error: 'bucket down' });
    });

    it('marks the run "failed" when both legs fail', async () => {
      mongoBackup.copyDatabase.mockRejectedValue(new Error('mongo down'));
      supabaseBackup.mirrorBucket.mockRejectedValue(new Error('bucket down'));

      const result = await orchestrator.runFullBackup();

      expect(result.status).toBe('failed');
      expect(BackupLog.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'full', status: 'failed' }));
    });

    it('runs mongo before supabase', async () => {
      const order = [];
      mongoBackup.copyDatabase.mockImplementation(async () => { order.push('mongo'); return {}; });
      supabaseBackup.mirrorBucket.mockImplementation(async () => { order.push('supabase'); return { failed: [] }; });

      await orchestrator.runFullBackup();

      expect(order).toEqual(['mongo', 'supabase']);
    });
  });

  describe('testEndpointConnections', () => {
    it('maps healthy results for both endpoints', async () => {
      mongoBackup.testConnection.mockResolvedValue({ ok: true });
      supabaseBackup.testConnection.mockResolvedValue({ ok: true, bucket: 'b' });

      const result = await orchestrator.testEndpointConnections();

      expect(result.main.mongo).toEqual({ ok: true });
      expect(result.main.supabase).toEqual({ ok: true, bucket: 'b' });
      expect(result.backup.mongo).toEqual({ ok: true });
      expect(result.backup.supabase).toEqual({ ok: true, bucket: 'b' });
    });

    it('reports a failure for one endpoint without throwing or skipping the others', async () => {
      mongoBackup.testConnection
        .mockRejectedValueOnce(new Error('main mongo down'))
        .mockResolvedValueOnce({ ok: true });
      supabaseBackup.testConnection.mockResolvedValue({ ok: true });

      const result = await orchestrator.testEndpointConnections();

      expect(result.main.mongo).toEqual({ ok: false, error: 'main mongo down' });
      expect(result.backup.mongo).toEqual({ ok: true });
    });

    it('reports failures for both mongo and supabase independently', async () => {
      mongoBackup.testConnection.mockRejectedValue(new Error('mongo down'));
      supabaseBackup.testConnection.mockRejectedValue(new Error('supabase down'));

      const result = await orchestrator.testEndpointConnections();

      expect(result.main.mongo).toEqual({ ok: false, error: 'mongo down' });
      expect(result.main.supabase).toEqual({ ok: false, error: 'supabase down' });
      expect(result.backup.mongo).toEqual({ ok: false, error: 'mongo down' });
      expect(result.backup.supabase).toEqual({ ok: false, error: 'supabase down' });
    });
  });

  describe('getRecentLogs', () => {
    const makeQueryChain = (resolvedValue) => {
      const query = {
        sort: jest.fn(() => query),
        skip: jest.fn(() => query),
        limit: jest.fn(() => query),
        populate: jest.fn(() => query),
        lean: jest.fn().mockResolvedValue(resolvedValue),
      };
      return query;
    };

    it('returns paginated logs with total/page/totalPages', async () => {
      const query = makeQueryChain([{ _id: '1' }, { _id: '2' }]);
      BackupLog.find = jest.fn(() => query);
      BackupLog.countDocuments = jest.fn().mockResolvedValue(25);

      const result = await orchestrator.getRecentLogs({ limit: 10, page: 2 });

      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual({ logs: [{ _id: '1' }, { _id: '2' }], total: 25, page: 2, totalPages: 3 });
    });

    it('returns an empty result set without error when there are no logs', async () => {
      const query = makeQueryChain([]);
      BackupLog.find = jest.fn(() => query);
      BackupLog.countDocuments = jest.fn().mockResolvedValue(0);

      const result = await orchestrator.getRecentLogs({});

      expect(result).toEqual({ logs: [], total: 0, page: 1, totalPages: 0 });
    });

    it('filters by type only when it is one of the known enum values', async () => {
      const query = makeQueryChain([]);
      BackupLog.find = jest.fn(() => query);
      BackupLog.countDocuments = jest.fn().mockResolvedValue(0);

      await orchestrator.getRecentLogs({ type: 'mongo' });
      expect(BackupLog.find).toHaveBeenCalledWith({ type: 'mongo' });

      await orchestrator.getRecentLogs({ type: 'not-a-real-type' });
      expect(BackupLog.find).toHaveBeenLastCalledWith({});
    });

    it('applies a createdAt range filter when from/to are given', async () => {
      const query = makeQueryChain([]);
      BackupLog.find = jest.fn(() => query);
      BackupLog.countDocuments = jest.fn().mockResolvedValue(0);

      await orchestrator.getRecentLogs({ from: '2026-01-01', to: '2026-02-01' });

      expect(BackupLog.find).toHaveBeenCalledWith({
        createdAt: { $gte: new Date('2026-01-01'), $lte: new Date('2026-02-01') },
      });
    });

    it('sorts newest first', async () => {
      const query = makeQueryChain([]);
      BackupLog.find = jest.fn(() => query);
      BackupLog.countDocuments = jest.fn().mockResolvedValue(0);

      await orchestrator.getRecentLogs({});

      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });
});
