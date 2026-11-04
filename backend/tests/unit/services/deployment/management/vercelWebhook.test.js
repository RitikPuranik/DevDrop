jest.mock('../../../../../src/modules/deployment/vercelWebhookEvent.model', () => {
  const { createFakeModel } = require('../../../../helpers/fakeManagementDb');
  return createFakeModel({ uniques: [{ fields: ['eventId'] }] });
});
jest.mock('../../../../../src/services/deployment/versionSync.service', () => ({ reconcileProjectDeployment: jest.fn().mockResolvedValue({ sites: 1 }) }));
const crypto = require('crypto');
const Events = require('../../../../../src/modules/deployment/vercelWebhookEvent.model');
const { reconcileProjectDeployment } = require('../../../../../src/services/deployment/versionSync.service');
const { handleWebhook, verifySignature } = require('../../../../../src/services/deployment/vercelWebhook.service');

const SECRET = 'whsec_test';
const sign = (raw, secret = SECRET) => crypto.createHmac('sha1', secret).update(raw).digest('hex');
const body = (o = {}) => Buffer.from(JSON.stringify({ id: 'evt_1', type: 'deployment.succeeded', payload: { project: { id: 'prj_1' }, deployment: { id: 'dpl_1' } }, ...o }));

beforeEach(() => { process.env.VERCEL_WEBHOOK_SECRET = SECRET; Events.__reset(); reconcileProjectDeployment.mockClear(); });
afterAll(() => { delete process.env.VERCEL_WEBHOOK_SECRET; });

describe('vercel webhook', () => {
  it('rejects when no secret is configured (never accepts unsigned traffic)', async () => {
    delete process.env.VERCEL_WEBHOOK_SECRET; delete process.env.VERCEL_CLIENT_SECRET;
    const raw = body();
    expect((await handleWebhook(raw, { 'x-vercel-signature': sign(raw) })).status).toBe(503);
  });
  it('rejects missing / wrong / tampered signatures', async () => {
    const raw = body();
    expect((await handleWebhook(raw, {})).status).toBe(401);
    expect((await handleWebhook(raw, { 'x-vercel-signature': sign(raw, 'other') })).status).toBe(401);
    expect((await handleWebhook(raw, { 'x-vercel-signature': 'zz' })).status).toBe(401);
    expect((await handleWebhook(Buffer.from(raw.toString() + ' '), { 'x-vercel-signature': sign(raw) })).status).toBe(401);
    expect(reconcileProjectDeployment).not.toHaveBeenCalled();
  });
  it('verifySignature is constant-time safe for length mismatches', () => {
    expect(verifySignature(body(), 'abcd', SECRET)).toBe(false);
  });
  it('accepts a valid event and reconciles from Vercel (body is only a hint)', async () => {
    const raw = body();
    const r = await handleWebhook(raw, { 'x-vercel-signature': sign(raw) });
    expect(r.status).toBe(200);
    expect(reconcileProjectDeployment).toHaveBeenCalledWith('prj_1', 'dpl_1');
  });
  it('processes duplicate deliveries once', async () => {
    const raw = body();
    const h = { 'x-vercel-signature': sign(raw) };
    await handleWebhook(raw, h);
    const second = await handleWebhook(raw, h);
    expect(second.body.duplicate).toBe(true);
    expect(reconcileProjectDeployment).toHaveBeenCalledTimes(1);
  });
  it('ignores unrelated events and malformed payloads', async () => {
    const other = body({ type: 'project.created' });
    expect((await handleWebhook(other, { 'x-vercel-signature': sign(other) })).body.ignored).toBe(true);
    const noIds = body({ id: 'e2', payload: {} });
    expect((await handleWebhook(noIds, { 'x-vercel-signature': sign(noIds) })).body.ignored).toBe(true);
    const bad = Buffer.from('{nope');
    expect((await handleWebhook(bad, { 'x-vercel-signature': sign(bad) })).status).toBe(400);
  });
  it('un-records the event when processing fails so Vercel\'s retry works', async () => {
    reconcileProjectDeployment.mockRejectedValueOnce(new Error('db down'));
    const raw = body();
    const h = { 'x-vercel-signature': sign(raw) };
    expect((await handleWebhook(raw, h)).status).toBe(500);
    expect((await handleWebhook(raw, h)).status).toBe(200);
    expect(reconcileProjectDeployment).toHaveBeenCalledTimes(2);
  });
});
