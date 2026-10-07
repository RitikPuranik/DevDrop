const request = require('supertest');
const { createApp } = require('../../src/app');
const { buildHeaders } = require('../../../backend/src/shared/utils/internalSignature');

const SECRET = process.env.INTERNAL_WEBHOOK_SECRET;
const post = (app, body, headers) =>
  request(app).post('/internal/webhooks/tasks').set(headers || buildHeaders(SECRET, JSON.stringify(body))).send(JSON.stringify(body));

describe('worker app', () => {
  const runner = { enqueue: jest.fn(), stats: () => ({ running: 0, queued: 0 }) };
  const app = createApp({ runner });

  it('GET /health works without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects unsigned and wrongly-signed task webhooks', async () => {
    const body = { taskId: 't', type: 'X' };
    expect((await request(app).post('/internal/webhooks/tasks').send(body)).status).toBe(401);
    const bad = buildHeaders('wrong-secret', JSON.stringify(body));
    expect((await post(app, body, bad)).status).toBe(401);
    expect(runner.enqueue).not.toHaveBeenCalled();
  });

  it('acknowledges a signed task with 202 and enqueues it', async () => {
    runner.enqueue.mockReturnValue({ accepted: true });
    const res = await post(app, { taskId: 't1', type: 'RUN_BACKUP', payload: { a: 1 } });
    expect(res.status).toBe(202);
    expect(runner.enqueue).toHaveBeenCalledWith({ taskId: 't1', type: 'RUN_BACKUP', payload: { a: 1 } });
  });

  it('maps runner rejections to status codes and validates the body', async () => {
    runner.enqueue.mockReturnValue({ accepted: false, reason: 'queue_full' });
    expect((await post(app, { taskId: 't2', type: 'X' })).status).toBe(429);
    expect((await post(app, { type: 'X' })).status).toBe(400);
  });
});
