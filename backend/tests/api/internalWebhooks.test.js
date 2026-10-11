const request = require('supertest');

jest.mock('../../src/modules/kashi/kashiFixRun.model', () => ({ exists: jest.fn() }));
jest.mock('../../src/shared/realtime/socket', () => ({ emitToKashiRun: jest.fn(), emitToJob: jest.fn(), init: jest.fn() }));

const app = require('../../src/app');
const KashiFixRun = require('../../src/modules/kashi/kashiFixRun.model');
const realtime = require('../../src/shared/realtime/socket');
const { buildHeaders } = require('../../src/shared/utils/internalSignature');

const SECRET = 'test-internal-webhook-secret';
const send = (path, body, headers) =>
  request(app).post(`/internal/webhooks/${path}`).set(headers || buildHeaders(SECRET, JSON.stringify(body))).send(JSON.stringify(body));

describe('internal webhooks', () => {
  beforeEach(() => {
    process.env.INTERNAL_WEBHOOK_SECRET = SECRET;
  });

  it('no longer exposes the old task-result callback (job status lives in MongoDB/BullMQ)', async () => {
    const body = { taskId: 't1', status: 'completed' };
    expect((await send('task-result', body)).status).toBe(404);
  });

  describe('POST /internal/webhooks/task-progress', () => {
    const body = { taskId: 'j1', runId: 'run1', event: { type: 'step', step: { kind: 'info' } } };

    it('rejects requests without a valid signature', async () => {
      expect((await request(app).post('/internal/webhooks/task-progress').send(body)).status).toBe(401);
      expect((await send('task-progress', body, buildHeaders('wrong', JSON.stringify(body)))).status).toBe(401);
      expect(realtime.emitToKashiRun).not.toHaveBeenCalled();
    });

    it('forwards a step event to the Kashi run room', async () => {
      KashiFixRun.exists.mockResolvedValue({ _id: 'run1' });
      expect((await send('task-progress', body)).status).toBe(200);
      expect(realtime.emitToKashiRun).toHaveBeenCalledWith('run1', 'kashi-fix:step', { runId: 'run1', step: { kind: 'info' } });
    });

    it('404s for an unknown run and 400s for a malformed event', async () => {
      KashiFixRun.exists.mockResolvedValue(null);
      expect((await send('task-progress', body)).status).toBe(404);
      expect((await send('task-progress', { taskId: 'j1' })).status).toBe(400);
    });
  });
});
