const fakes = require('../../helpers/billingFakes');
jest.mock('../../../src/modules/billing/models', () => { const f = require('../../helpers/billingFakes'); return { Subscription: f.Subscription, BillingOrder: f.BillingOrder, UsageCounter: f.UsageCounter, GenerationLedger: f.GenerationLedger, CouponRedemption: f.CouponRedemption }; });
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('../../unit/infrastructure/mockQueueJob'));
const mockEnqueue = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../../src/infrastructure/queue/queues', () => ({
  enqueueJob: (...a) => mockEnqueue(...a),
  removeWaitingJob: (...a) => mockRemove(...a),
  isJobLive: jest.fn().mockResolvedValue(true),
  QueueUnavailableError: class extends Error {},
}));
jest.mock('../../../src/services/ai-studio/aiStudioAssetPipeline.service', () => ({ resolveGenerationAssets: jest.fn(async () => ({ assets: {}, media: [] })) }));
const mockGetProject = jest.fn(async () => null);
jest.mock('../../../src/services/ai-studio/aiStudioLifecycle.service', () => ({ getOwnedProject: (...a) => mockGetProject(...a), attachJob: jest.fn(async () => {}), finishJob: jest.fn(async () => {}) }));
jest.mock('../../../src/shared/realtime/socket', () => ({ emitToJob: jest.fn(), init: jest.fn() }));
// Any HTTP call to ai-service (or anything else) goes through axios: it must never be touched.
jest.mock('axios', () => { const f = jest.fn(async () => ({ data: {} })); f.post = jest.fn(async () => ({ data: {} })); f.get = jest.fn(async () => ({ data: {} })); return f; });

// Lets a test simulate a plan that grants no generations (no env switch exists for this in production).
let mockFreeQuota;
jest.mock('../../../src/modules/billing/plans.config', () => {
  const actual = jest.requireActual('../../../src/modules/billing/plans.config');
  return { ...actual, getPlans: (env) => { const p = actual.getPlans(env); if (mockFreeQuota !== undefined) p.free.generationQuota = mockFreeQuota; return p; } };
});
const axios = require('axios');
const QueueJob = require('../../unit/infrastructure/mockQueueJob');
const controller = require('../../../src/modules/ai-generate/ai-generate.controller');
const webhook = require('../../../src/modules/ai-generate/aiWebhook.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

const U = 'user-1';
const T0 = new Date('2026-11-01T10:00:00Z');
const seedSub = (over = {}) => fakes.Subscription.__rows.push({ _id: 'sub1', userId: U, planId: 'pro', interval: 'monthly', status: 'active', termStart: T0, currentPeriodEnd: new Date('2026-12-01T10:00:00Z'), quotaAnchor: T0, cancelAtPeriodEnd: false, createdAt: T0, updatedAt: T0, ...over });
const body = (text = 'make a portfolio', extra = {}) => ({ messages: [{ role: 'user', content: text }], ...extra });
const call = async (b, userId = U) => { const res = mockRes(); await controller.generate(mockReq({ body: b, userId }), res); return res; };
const status = (res) => res.status.mock.calls[0]?.[0];
const payload = (res) => res.json.mock.calls[0]?.[0];

// The single assertion that defines the requirement: nothing reached the AI dispatch boundary.
const expectZeroAiDispatch = (existingKeys = []) => {
  expect(mockEnqueue).not.toHaveBeenCalled(); // no BullMQ job
  expect(QueueJob.create).not.toHaveBeenCalled(); // no job record
  expect([...QueueJob.__docs.values()].filter((d) => d.type === 'AI_GENERATE' && !existingKeys.includes(d.jobKey))).toHaveLength(0);
  expect(axios.post).not.toHaveBeenCalled(); // no HTTP to ai-service
  expect(axios).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(T0);
  fakes.reset(); QueueJob.__reset(); jest.clearAllMocks();
  mockEnqueue.mockResolvedValue({ accepted: true });
  process.env.AI_SERVICE_TOKEN = 'svc-key';
});
afterEach(() => jest.useRealTimers());

describe('POST /api/ai-generate: entitled requests', () => {
  it('Free user: first generation is enqueued exactly once and the unit is reserved', async () => {
    const res = await call(body());
    expect(status(res)).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(fakes.GenerationLedger.__rows).toMatchObject([{ kind: 'generate', status: 'reserved', planId: 'free' }]);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
  it('Pro and Plus users can generate', async () => {
    seedSub({ planId: 'plus' });
    expect(status(await call(body()))).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});

describe('ZERO ai-service dispatch when the user is not entitled', () => {
  it('Free user with the allowance exhausted: 402 GENERATION_QUOTA_EXCEEDED, nothing dispatched', async () => {
    await call(body('first'));
    mockEnqueue.mockClear(); QueueJob.create.mockClear();
    QueueJob.__reset(); axios.post.mockClear();
    const res = await call(body('second'));
    expect(status(res)).toBe(402);
    expect(payload(res)).toMatchObject({ success: false, code: 'GENERATION_QUOTA_EXCEEDED', data: { currentPlan: { id: 'free' }, used: 1, limit: 1, remaining: 0 } });
    expect(payload(res).data.upgradeOptions.length).toBe(2);
    expectZeroAiDispatch();
    expect(fakes.GenerationLedger.__rows).toHaveLength(1); // no extra charge row
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1); // no quota consumed
  });
  it('Pro user at 20/20: refused, with reset date and Plus as the only upgrade', async () => {
    seedSub({ planId: 'pro' });
    fakes.UsageCounter.__rows.push({ _id: 'c', userId: U, windowKey: T0.toISOString(), generationsUsed: 20, editsUsed: 0 });
    const res = await call(body());
    expect(status(res)).toBe(402);
    expect(payload(res).data).toMatchObject({ currentPlan: { id: 'pro' }, used: 20, limit: 20, resetAt: '2026-12-01T10:00:00.000Z', isTopPlan: false });
    expect(payload(res).data.upgradeOptions.map((o) => o.planId)).toEqual(['plus']);
    expectZeroAiDispatch();
  });
  it('Plus user at 50/50: refused, no upgrade recommended', async () => {
    seedSub({ planId: 'plus' });
    fakes.UsageCounter.__rows.push({ _id: 'c', userId: U, windowKey: T0.toISOString(), generationsUsed: 50, editsUsed: 0 });
    const res = await call(body());
    expect(payload(res).data).toMatchObject({ isTopPlan: true, upgradeOptions: [] });
    expectZeroAiDispatch();
  });
  it('a plan with no generation access: 403 PLAN_UPGRADE_REQUIRED', async () => {
    mockFreeQuota = 0;
    try {
      const res = await call(body());
      expect(status(res)).toBe(403);
      expect(payload(res).code).toBe('PLAN_UPGRADE_REQUIRED');
      expectZeroAiDispatch();
    } finally { mockFreeQuota = undefined; }
  });
  it('expired subscription with the Free allowance spent: 403 SUBSCRIPTION_INACTIVE', async () => {
    seedSub({ planId: 'pro', currentPeriodEnd: new Date('2026-10-20T00:00:00Z') });
    fakes.UsageCounter.__rows.push({ _id: 'f', userId: U, windowKey: 'free:lifetime', generationsUsed: 1, editsUsed: 0 });
    const res = await call(body());
    expect(status(res)).toBe(403);
    expect(payload(res).code).toBe('SUBSCRIPTION_INACTIVE');
    expectZeroAiDispatch();
  });
  it('direct API bypass: claiming "edit" with fabricated files is charged (and blocked) as a generation', async () => {
    await call(body('first')); // spends the Free generation
    mockEnqueue.mockClear(); QueueJob.__reset(); QueueJob.create.mockClear();
    const res = await call(body('edit it', { fileData: { files: { 'src/App.jsx': 'fake' } }, projectId: 'p-fake' }));
    expect(status(res)).toBe(402);
    expect(payload(res).code).toBe('GENERATION_QUOTA_EXCEEDED');
    expectZeroAiDispatch();
  });
  it('direct API bypass: a paid "edit" without a generated project consumes a generation unit', async () => {
    seedSub({ planId: 'pro' });
    const res = await call(body('edit', { fileData: { files: { 'a.js': 'x' } }, projectId: 'p-fake' }));
    expect(status(res)).toBe(202);
    expect(fakes.GenerationLedger.__rows[0].kind).toBe('generate');
    expect(fakes.UsageCounter.__rows.find((c) => c.windowKey === T0.toISOString()).generationsUsed).toBe(1);
  });
  it('spoofed identity fields in the body are ignored: the unit is charged to the authenticated user', async () => {
    await call(body('x', { userId: 'someone-else', plan: 'plus', subscription: { planId: 'plus' } }), U);
    expect(fakes.GenerationLedger.__rows[0].userId).toBe(U);
    expect(fakes.GenerationLedger.__rows[0].planId).toBe('free');
  });
  it('10 concurrent requests from a Free user dispatch exactly one job', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call(body(`req ${i}`))));
    expect(results.filter((r) => status(r) === 202)).toHaveLength(1);
    expect(results.filter((r) => status(r) === 402)).toHaveLength(9);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
  it('20 concurrent requests against Pro 19/20: exactly one more is dispatched', async () => {
    seedSub({ planId: 'pro' });
    fakes.UsageCounter.__rows.push({ _id: 'c', userId: U, windowKey: T0.toISOString(), generationsUsed: 19, editsUsed: 0 });
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => call(body(`req ${i}`))));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => status(r) === 202)).toHaveLength(1);
  });
  it('invalid input never consumes quota', async () => {
    const res = await call({ messages: [] });
    expect(status(res)).toBe(400);
    expect(fakes.UsageCounter.__rows).toHaveLength(0);
    expectZeroAiDispatch();
  });
});

describe('quota accounting across the job lifecycle', () => {
  it('queue unavailable at enqueue: the unit is released, not burned', async () => {
    mockEnqueue.mockRejectedValueOnce(Object.assign(new Error('redis down'), { code: 'QUEUE_UNAVAILABLE' }));
    const res = await call(body());
    expect(status(res)).toBe(503);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(0);
    expect(fakes.GenerationLedger.__rows[0].status).toBe('released');
    expect(status(await call(body('again')))).toBe(202); // user can retry
  });
  const jobKeyOf = () => mockEnqueue.mock.calls[0][0].jobKey;
  const seedJobRecord = (over) => QueueJob.__docs.set(jobKeyOf(), { jobKey: jobKeyOf(), type: 'AI_GENERATE', userId: U, status: 'active', projectId: undefined, ...over });
  const hook = async (event, extra = {}) => { const res = mockRes(); await webhook.receive({ header: (h) => (h === 'X-Service-Key' ? 'svc-key' : undefined), body: { event, jobId: jobKeyOf(), ...extra } }, res); return res; };

  it('completed => committed (unit stays); a duplicate completion event changes nothing', async () => {
    await call(body()); seedJobRecord({});
    await hook('completed', { result: { files: {} } });
    expect(fakes.GenerationLedger.__rows[0].status).toBe('committed');
    await hook('completed', { result: { files: {} } });
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
  it('failed => refunded once, even when the failure event is delivered twice', async () => {
    await call(body()); seedJobRecord({});
    await hook('failed', { error: 'boom' });
    await hook('failed', { error: 'boom' });
    expect(fakes.GenerationLedger.__rows[0]).toMatchObject({ status: 'released', releasedReason: 'failed' });
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(0);
  });
  it('internal retries / quota delays / "retrying" events never charge again', async () => {
    await call(body()); seedJobRecord({});
    await hook('started', { attempt: 1 });
    await hook('delayed', { retryAt: 'later' });
    await hook('retrying', { error: 'transient' });
    await hook('started', { attempt: 2 });
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
    expect(fakes.GenerationLedger.__rows).toHaveLength(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
  it('cancel while queued refunds; cancel while running keeps the unit', async () => {
    await call(body()); seedJobRecord({ status: 'queued' });
    let res = mockRes(); await controller.cancel(mockReq({ params: { id: jobKeyOf() }, userId: U }), res);
    expect(fakes.GenerationLedger.__rows[0].status).toBe('released');
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(0);

    fakes.reset(); QueueJob.__reset(); mockEnqueue.mockClear();
    await call(body('b')); seedJobRecord({ status: 'active' });
    res = mockRes(); await controller.cancel(mockReq({ params: { id: jobKeyOf() }, userId: U }), res);
    expect(fakes.GenerationLedger.__rows[0].status).toBe('committed');
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
});

describe('debug retry goes through the same gate', () => {
  const failedJob = (key = 'orig') => QueueJob.__docs.set(key, { jobKey: key, type: 'AI_GENERATE', userId: U, status: 'failed', projectId: 'p1', debugContext: { files: { 'a.js': 'x' }, dependencies: {}, errors: [] } });
  const retry = async (key = 'orig') => { const res = mockRes(); await controller.debugRetry(mockReq({ params: { id: key }, userId: U }), res); return res; };

  it('after a failure released the unit, the retry re-takes it: one unit per generation', async () => {
    await call(body()); const key = mockEnqueue.mock.calls[0][0].jobKey;
    QueueJob.__docs.set(key, { jobKey: key, type: 'AI_GENERATE', userId: U, status: 'failed', projectId: 'p1', debugContext: { files: {}, dependencies: {}, errors: [] } });
    await hook(key);
    mockEnqueue.mockClear();
    const res = await retry(key);
    expect(status(res)).toBe(202);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(fakes.GenerationLedger.__rows).toHaveLength(1);
    expect(fakes.GenerationLedger.__rows[0]).toMatchObject({ status: 'reserved' });
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
    async function hook(k) { await webhook.receive({ header: () => 'svc-key', body: { event: 'failed', jobId: k, error: 'x' } }, mockRes()); }
  });
  it('a user who has since spent their allowance cannot use debug retry to get a free generation', async () => {
    failedJob();
    // failed job already refunded; the Free allowance was spent on something else
    fakes.GenerationLedger.__rows.push({ _id: 'l', userId: U, jobKey: 'orig', kind: 'generate', planId: 'free', windowKey: 'free:lifetime', counted: true, status: 'released' });
    fakes.UsageCounter.__rows.push({ _id: 'f', userId: U, windowKey: 'free:lifetime', generationsUsed: 1, editsUsed: 0 });
    const res = await retry();
    expect(status(res)).toBe(402);
    expectZeroAiDispatch(['orig']);
  });
  it('without any entitlement the retry is refused and nothing is enqueued', async () => {
    mockFreeQuota = 0;
    try { failedJob(); const res = await retry(); expect(status(res)).toBe(403); expectZeroAiDispatch(['orig']); } finally { mockFreeQuota = undefined; }
  });
});

describe('defense in depth: the internal payload endpoint', () => {
  const getPayload = async (jobKey) => { const res = mockRes(); await webhook.getPayload({ header: () => 'svc-key', params: { id: jobKey } }, res); return res; };
  it('never serves a job that holds no reservation (e.g. injected directly into the queue)', async () => {
    QueueJob.__docs.set('rogue', { jobKey: 'rogue', type: 'AI_GENERATE', userId: U, status: 'queued', payload: { messages: [{ role: 'user', content: 'free ride' }] } });
    const res = await getPayload('rogue');
    expect(status(res)).toBe(403);
    expect(payload(res)).toMatchObject({ code: 'NOT_ENTITLED' });
    expect(JSON.stringify(payload(res))).not.toMatch(/free ride/);
  });
  it('serves a job that went through the gate', async () => {
    await call(body());
    const key = mockEnqueue.mock.calls[0][0].jobKey;
    QueueJob.__docs.set(key, { jobKey: key, type: 'AI_GENERATE', userId: U, status: 'queued', payload: { messages: [] }, mode: 'generate' });
    expect(status(await getPayload(key))).toBe(200);
  });
  it('a released (refunded) job is no longer served', async () => {
    await call(body());
    const key = mockEnqueue.mock.calls[0][0].jobKey;
    QueueJob.__docs.set(key, { jobKey: key, type: 'AI_GENERATE', userId: U, status: 'queued', payload: { messages: [] } });
    await require('../../../src/modules/billing/entitlement.service').releaseJob(key, 'x');
    expect(status(await getPayload(key))).toBe(403);
  });
});

describe('route-level authentication', () => {
  const express = require('express');
  const request = require('supertest');
  const app = express();
  app.use(express.json());
  app.use('/api/ai-generate', require('../../../src/modules/ai-generate/ai-generate.routes'));
  app.use('/api/billing', require('../../../src/modules/billing/billing.routes'));
  it.each([
    ['post', '/api/ai-generate'],
    ['post', '/api/ai-generate/jobs/x/debug-retry'],
    ['get', '/api/billing/plans'],
    ['get', '/api/billing/subscription'],
    ['get', '/api/billing/usage'],
    ['get', '/api/billing/orders'],
    ['post', '/api/billing/checkout'],
    ['post', '/api/billing/quote'],
    ['post', '/api/billing/coupons/validate'],
    ['post', '/api/billing/subscription/cancel'],
  ])('%s %s without a token is 401 and dispatches nothing', async (method, url) => {
    const res = await request(app)[method](url).send({ messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(401);
    expectZeroAiDispatch();
  });
  it('the internal payload endpoint rejects a missing service key', async () => {
    const res = await request(app).get('/api/ai-generate/internal/abc/payload');
    expect(res.status).toBe(401);
  });
});
