// Real controller logic under test; the orchestrator it calls into is
// mocked so no real Mongo/Supabase operations occur.
jest.mock('../../../src/services/backup/backup.orchestrator');

const orchestrator = require('../../../src/services/backup/backup.orchestrator');
const { getStatus, getHistory, backupMongo, backupSupabase, backupFull } = require('../../../src/modules/backup/backup.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

describe('backup.controller', () => {
  describe('getStatus', () => {
    it('returns configured flags, connection results, and schedule together', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({ mongoConfigured: true, supabaseConfigured: true });
      orchestrator.testEndpointConnections.mockResolvedValue({ main: {}, backup: {} });
      orchestrator.getScheduleInfo.mockReturnValue({ mode: 'default', intervalHours: 24, label: 'Every 24 hours (default)' });

      const req = mockReq();
      const res = mockRes();
      await getStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          configured: { mongoConfigured: true, supabaseConfigured: true },
          connections: { main: {}, backup: {} },
          schedule: { mode: 'default', intervalHours: 24, label: 'Every 24 hours (default)' },
        },
      });
    });

    it('returns 500 when the connection test throws', async () => {
      orchestrator.isBackupTargetConfigured.mockReturnValue({});
      orchestrator.testEndpointConnections.mockRejectedValue(new Error('unreachable'));

      const req = mockReq();
      const res = mockRes();
      await getStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Failed to check backup status', error: 'unreachable' });
    });
  });

  describe('getHistory', () => {
    it('applies default limit/page when the query is empty', async () => {
      orchestrator.getRecentLogs.mockResolvedValue({ logs: [], total: 0, page: 1, totalPages: 0 });

      const req = mockReq({ query: {} });
      const res = mockRes();
      await getHistory(req, res);

      expect(orchestrator.getRecentLogs).toHaveBeenCalledWith({ limit: 10, page: 1, type: undefined, from: undefined, to: undefined });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { logs: [], total: 0, page: 1, totalPages: 0 } });
    });

    it('caps an oversized limit at the maximum', async () => {
      orchestrator.getRecentLogs.mockResolvedValue({ logs: [], total: 0, page: 1, totalPages: 0 });

      const req = mockReq({ query: { limit: '9999' } });
      const res = mockRes();
      await getHistory(req, res);

      expect(orchestrator.getRecentLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });

    it('falls back to defaults for invalid non-numeric limit/page', async () => {
      orchestrator.getRecentLogs.mockResolvedValue({ logs: [], total: 0, page: 1, totalPages: 0 });

      const req = mockReq({ query: { limit: 'abc', page: 'xyz' } });
      const res = mockRes();
      await getHistory(req, res);

      expect(orchestrator.getRecentLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, page: 1 }));
    });

    it('passes through type/from/to filters', async () => {
      orchestrator.getRecentLogs.mockResolvedValue({ logs: [], total: 0, page: 1, totalPages: 0 });

      const req = mockReq({ query: { type: 'mongo', from: '2026-01-01', to: '2026-02-01' } });
      const res = mockRes();
      await getHistory(req, res);

      expect(orchestrator.getRecentLogs).toHaveBeenCalledWith(expect.objectContaining({ type: 'mongo', from: '2026-01-01', to: '2026-02-01' }));
    });

    it('returns 500 when the orchestrator throws', async () => {
      orchestrator.getRecentLogs.mockRejectedValue(new Error('db down'));

      const req = mockReq({ query: {} });
      const res = mockRes();
      await getHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Failed to load backup history', error: 'db down' });
    });
  });

  describe('backupMongo', () => {
    it('defaults direction to main_to_backup and mode to replace', async () => {
      orchestrator.runMongoBackup.mockResolvedValue({ success: true });

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupMongo(req, res);

      expect(orchestrator.runMongoBackup).toHaveBeenCalledWith({
        direction: 'main_to_backup', trigger: 'manual', triggeredBy: 'user-1', mode: 'replace',
      });
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'MongoDB sync completed', data: { success: true } });
    });

    it('accepts an explicit merge mode and backup_to_main direction', async () => {
      orchestrator.runMongoBackup.mockResolvedValue({ success: true });

      const req = mockReq({ body: { direction: 'backup_to_main', mode: 'merge' } });
      const res = mockRes();
      await backupMongo(req, res);

      expect(orchestrator.runMongoBackup).toHaveBeenCalledWith(expect.objectContaining({ direction: 'backup_to_main', mode: 'merge' }));
    });

    it('rejects an invalid direction with a 400 before calling the orchestrator', async () => {
      const req = mockReq({ body: { direction: 'sideways' } });
      const res = mockRes();
      await backupMongo(req, res);

      expect(orchestrator.runMongoBackup).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Invalid direction. Use 'main_to_backup' or 'backup_to_main'." });
    });

    it('returns 400 when the orchestrator run itself fails', async () => {
      orchestrator.runMongoBackup.mockRejectedValue(new Error('replica set unreachable'));

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupMongo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'replica set unreachable' });
    });
  });

  describe('backupSupabase', () => {
    it('defaults supabaseMode to mirror', async () => {
      orchestrator.runSupabaseBackup.mockResolvedValue({ success: true });

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupSupabase(req, res);

      expect(orchestrator.runSupabaseBackup).toHaveBeenCalledWith(expect.objectContaining({ supabaseMode: 'mirror' }));
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Supabase storage sync completed', data: { success: true } });
    });

    it('rejects an invalid supabaseMode with a 400', async () => {
      const req = mockReq({ body: { supabaseMode: 'nonsense' } });
      const res = mockRes();
      await backupSupabase(req, res);

      expect(orchestrator.runSupabaseBackup).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when the sync fails', async () => {
      orchestrator.runSupabaseBackup.mockRejectedValue(new Error('bucket missing'));

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupSupabase(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'bucket missing' });
    });
  });

  describe('backupFull', () => {
    it('returns 200 with a "completed" message for a successful main_to_backup run', async () => {
      orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupFull(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Backup completed', data: { status: 'success' } });
    });

    it('uses restore wording for a successful backup_to_main run', async () => {
      orchestrator.runFullBackup.mockResolvedValue({ status: 'success' });

      const req = mockReq({ body: { direction: 'backup_to_main' } });
      const res = mockRes();
      await backupFull(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Restore from backup completed' }));
    });

    it('returns 200 but success:true=false is not set for a "partial" outcome', async () => {
      orchestrator.runFullBackup.mockResolvedValue({ status: 'partial' });

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupFull(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: 'Backup partial' }));
    });

    it('returns 500 with success:false for a "failed" outcome', async () => {
      orchestrator.runFullBackup.mockResolvedValue({ status: 'failed' });

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupFull(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Backup failed' }));
    });

    it('returns 400 when direction/supabaseMode validation fails before the run', async () => {
      const req = mockReq({ body: { supabaseMode: 'nonsense' } });
      const res = mockRes();
      await backupFull(req, res);

      expect(orchestrator.runFullBackup).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 when the orchestrator throws unexpectedly', async () => {
      orchestrator.runFullBackup.mockRejectedValue(new Error('unexpected crash'));

      const req = mockReq({ body: {} });
      const res = mockRes();
      await backupFull(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'unexpected crash' });
    });
  });
});
