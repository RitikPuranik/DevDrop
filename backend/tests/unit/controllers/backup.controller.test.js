// Real controller logic under test; the orchestrator it calls into is
// mocked so no real Mongo/Supabase operations occur.
jest.mock('../../../src/services/backup/backup.orchestrator');
jest.mock('../../../src/services/worker.client');

const orchestrator = require('../../../src/services/backup/backup.orchestrator');
const workerClient = require('../../../src/services/worker.client');
const taskRegistry = require('../../../src/services/taskRegistry.service');
const { getStatus, getHistory, backupMongo, backupSupabase, backupFull, getTaskStatus } = require('../../../src/modules/backup/backup.controller');
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

  // Backups are no longer run by the Backend: the controller validates, then
  // dispatches a RUN_BACKUP task to the Worker and answers 202 immediately.
  describe('dispatching to the worker', () => {
    beforeEach(() => {
      workerClient.dispatchTask.mockResolvedValue({ taskId: 'task-1' });
    });

    it('backupMongo dispatches a mongo task with defaults and returns 202 with the taskId', async () => {
      const req = mockReq({ body: {}, userId: 'admin1' });
      const res = mockRes();
      await backupMongo(req, res);

      expect(workerClient.dispatchTask).toHaveBeenCalledWith('RUN_BACKUP', {
        kind: 'mongo', direction: 'main_to_backup', mode: 'replace', triggeredBy: 'admin1',
      });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { taskId: 'task-1', status: 'queued' },
      }));
    });

    it('backupMongo passes an explicit merge mode and backup_to_main direction', async () => {
      const req = mockReq({ body: { direction: 'backup_to_main', mode: 'merge' }, userId: 'admin1' });
      await backupMongo(req, mockRes());
      expect(workerClient.dispatchTask).toHaveBeenCalledWith('RUN_BACKUP', expect.objectContaining({ kind: 'mongo', direction: 'backup_to_main', mode: 'merge' }));
    });

    it('backupSupabase dispatches a supabase task defaulting to mirror', async () => {
      const req = mockReq({ body: {}, userId: 'admin1' });
      const res = mockRes();
      await backupSupabase(req, res);
      expect(workerClient.dispatchTask).toHaveBeenCalledWith('RUN_BACKUP', {
        kind: 'supabase', direction: 'main_to_backup', supabaseMode: 'mirror', triggeredBy: 'admin1',
      });
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('backupFull dispatches a full task; restore direction uses restore wording', async () => {
      const req = mockReq({ body: { direction: 'backup_to_main' }, userId: 'admin1' });
      const res = mockRes();
      await backupFull(req, res);
      expect(workerClient.dispatchTask).toHaveBeenCalledWith('RUN_BACKUP', {
        kind: 'full', direction: 'backup_to_main', mode: 'replace', supabaseMode: 'mirror', triggeredBy: 'admin1',
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Restore from backup started') }));
    });

    it('rejects an invalid direction / supabaseMode with 400 and never dispatches', async () => {
      for (const [fn, body] of [[backupMongo, { direction: 'sideways' }], [backupSupabase, { supabaseMode: 'nope' }], [backupFull, { direction: 'x' }]]) {
        const res = mockRes();
        await fn(mockReq({ body }), res);
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(workerClient.dispatchTask).not.toHaveBeenCalled();
    });

    it('returns 503 when the worker cannot be reached', async () => {
      workerClient.dispatchTask.mockRejectedValue(new Error('Worker dispatch failed: ECONNREFUSED'));
      const res = mockRes();
      await backupFull(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: expect.stringContaining('Worker unavailable') }));
    });
  });

  describe('getTaskStatus', () => {
    beforeEach(() => taskRegistry.clear());

    it('returns the current task state', () => {
      taskRegistry.create('t1', 'RUN_BACKUP');
      taskRegistry.update('t1', { status: 'running' });
      const res = mockRes();
      getTaskStatus(mockReq({ params: { taskId: 't1' } }), res);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ taskId: 't1', status: 'running' }) });
    });

    it('returns 404 for an unknown task', () => {
      const res = mockRes();
      getTaskStatus(mockReq({ params: { taskId: 'missing' } }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
