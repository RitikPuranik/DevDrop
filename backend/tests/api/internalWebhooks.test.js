const request = require('supertest');
const app = require('../../src/app');
const registry = require('../../src/services/taskRegistry.service');
const { buildHeaders } = require('../../src/shared/utils/internalSignature');

const SECRET = 'test-internal-webhook-secret';
const send = (body, headers) =>
  request(app).post('/internal/webhooks/task-result').set(headers || buildHeaders(SECRET, JSON.stringify(body))).send(JSON.stringify(body));

describe('POST /internal/webhooks/task-result', () => {
  beforeEach(() => {
    process.env.INTERNAL_WEBHOOK_SECRET = SECRET;
    registry.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('rejects requests without a valid signature', async () => {
    registry.create('t1', 'RUN_BACKUP');
    const body = { taskId: 't1', status: 'completed' };
    expect((await request(app).post('/internal/webhooks/task-result').send(body)).status).toBe(401);
    expect((await send(body, buildHeaders('wrong', JSON.stringify(body)))).status).toBe(401);
    expect(registry.get('t1').status).toBe('queued');
  });

  it('records running then completed with a result', async () => {
    registry.create('t1', 'RUN_BACKUP');
    expect((await send({ taskId: 't1', status: 'running' })).status).toBe(200);
    expect((await send({ taskId: 't1', status: 'completed', result: { ok: true } })).status).toBe(200);
    expect(registry.get('t1')).toMatchObject({ status: 'completed', result: { ok: true } });
  });

  it('does not let a late "running" overwrite a terminal state', async () => {
    registry.create('t1', 'X');
    await send({ taskId: 't1', status: 'failed', error: 'boom' });
    await send({ taskId: 't1', status: 'running' });
    expect(registry.get('t1')).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('validates status and unknown tasks', async () => {
    expect((await send({ taskId: 't9', status: 'completed' })).status).toBe(404);
    expect((await send({ taskId: 't9', status: 'nope' })).status).toBe(400);
  });
});
