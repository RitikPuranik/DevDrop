const request = require('supertest');
const { createApp } = require('../../src/app');

describe('worker health endpoint', () => {
  it('200 with queue details when healthy', async () => {
    const app = createApp({ getHealth: async () => ({ ok: true, details: { queues: { 'events-queue': { waiting: 0 } } } }) });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.queues['events-queue']).toBeDefined();
  });
  it('503 when degraded or when Redis cannot be queried', async () => {
    expect((await request(createApp({ getHealth: async () => ({ ok: false, details: {} }) })).get('/health')).status).toBe(503);
    expect((await request(createApp({ getHealth: async () => { throw new Error('redis'); } })).get('/health')).status).toBe(503);
  });
  it('no longer exposes the internal task webhook (work arrives through BullMQ)', async () => {
    expect((await request(createApp({ getHealth: async () => ({ ok: true, details: {} }) })).post('/internal/webhooks/tasks').send({})).status).toBe(404);
  });
});
