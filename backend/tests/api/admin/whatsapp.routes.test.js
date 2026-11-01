process.env.WHATSAPP_ADMIN_SEND_LIMIT = '1000'; // the per-minute send limiter is exercised separately
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/services/supabase.service');
jest.mock('../../../src/infrastructure/events', () => require('../../mocks/services/events.mock'));
jest.mock('../../../src/infrastructure/notifications/whatsappNotification.model', () => require('../../helpers/whatsappFakes').WhatsAppNotification);
jest.mock('../../../src/infrastructure/notifications/whatsappSettings.model', () => require('../../helpers/whatsappFakes').WhatsAppSettings);
const mockEnqueueJob = jest.fn();
jest.mock('../../../src/infrastructure/queue/queues', () => ({ enqueueJob: (...a) => mockEnqueueJob(...a), QueueUnavailableError: class extends Error {} }));
const mockC = { site: jest.fn(), payout: jest.fn(), sub: jest.fn(), orders: jest.fn(), purchase: jest.fn() };
jest.mock('../../../src/modules/website/website.model', () => ({ countDocuments: (...a) => mockC.site(...a) }));
jest.mock('../../../src/modules/payout/payout.model', () => ({ aggregate: (...a) => mockC.payout(...a) }));
jest.mock('../../../src/modules/payment/purchase.model', () => ({ aggregate: (...a) => mockC.purchase(...a) }));
jest.mock('../../../src/modules/billing/models', () => ({ Subscription: { aggregate: (...a) => mockC.sub(...a) }, BillingOrder: { countDocuments: (...a) => mockC.orders(...a) } }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../../../src/modules/user/user.model');
const fakes = require('../../helpers/whatsappFakes');
const adminRoutes = require('../../../src/modules/admin/admin.routes');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

let adminToken; let userToken; let admin;
const as = (token) => (r) => r.set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  User.__reset(); fakes.reset(); jest.clearAllMocks();
  fakes.setWhatsAppEnv();
  mockEnqueueJob.mockResolvedValue({ duplicate: false, accepted: true });
  mockC.site.mockResolvedValue(4);
  mockC.payout.mockResolvedValue([{ _id: null, count: 2, totalAmount: 1500 }]);
  mockC.sub.mockResolvedValue([{ _id: 'pro', count: 5, cancelling: 0 }]);
  mockC.orders.mockResolvedValue(7);
  mockC.purchase.mockResolvedValue([{ _id: null, total: 10, paid: 8 }]);
  admin = await User.__seed({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  const user = await User.__seed({ name: 'User', email: 'user@example.com', password: 'password123', role: 'user' });
  adminToken = jwt.sign({ userId: admin._id.toString() }, process.env.JWT_SECRET);
  userToken = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET);
});
afterAll(fakes.clearWhatsAppEnv);

const ENDPOINTS = [
  ['get', '/api/admin/whatsapp/overview'],
  ['put', '/api/admin/whatsapp/settings'],
  ['get', '/api/admin/whatsapp/report/stats'],
  ['post', '/api/admin/whatsapp/report/preview'],
  ['post', '/api/admin/whatsapp/report/send'],
  ['get', '/api/admin/whatsapp/notifications'],
  ['post', '/api/admin/whatsapp/notifications/abc/retry'],
  ['post', '/api/admin/whatsapp/test'],
];

describe.each(ENDPOINTS)('%s %s authorization', (method, path) => {
  it('rejects unauthenticated requests (401) without touching any data', async () => {
    expect((await request(app)[method](path).send({ metrics: ['pending_payouts'] })).status).toBe(401);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
  it('rejects a normal user (403)', async () => {
    expect((await as(userToken)(request(app)[method](path)).send({ metrics: ['pending_payouts'] })).status).toBe(403);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
  it('rejects a forged token (401)', async () => {
    expect((await as('forged')(request(app)[method](path))).status).toBe(401);
  });
});

describe('overview', () => {
  it('exposes status flags and a masked recipient, never credentials', async () => {
    const res = await as(adminToken)(request(app).get('/api/admin/whatsapp/overview'));
    expect(res.status).toBe(200);
    expect(res.body.data.config).toEqual({ masterEnabled: true, configured: true, recipient: '+91******3210', graphApiVersion: 'v23.0' });
    expect(res.body.data.metrics.map((m) => m.id)).toEqual(['pending_verifications', 'pending_payouts', 'subscriptions', 'bought_websites']);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(fakes.WA_ENV.WHATSAPP_ACCESS_TOKEN);
    expect(raw).not.toContain('919876543210');
    expect(raw).not.toContain('1234567890');
  });
});

describe('report preview and send', () => {
  it('shows live backend statistics for the selection cards', async () => {
    const res = await as(adminToken)(request(app).get('/api/admin/whatsapp/report/stats'));
    expect(res.body.data.stats.pending_payouts).toEqual({ count: 2, totalAmount: 1500 });
  });

  it.each([[{}], [{ metrics: [] }], [{ metrics: ['users'] }], [{ metrics: 'pending_payouts' }]])('rejects an invalid selection %j', async (body) => {
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/report/preview').send(body))).status).toBe(400);
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send(body))).status).toBe(400);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it('previews only the selected statistics', async () => {
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/preview').send({ metrics: ['pending_payouts'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('Pending Payouts');
    expect(res.body.data.message).not.toContain('Active Subscriptions');
    expect(res.body.data.previewToken).toEqual(expect.any(String));
    expect(mockC.sub).not.toHaveBeenCalled();
  });

  it('sends exactly the previewed text, even if numbers changed since', async () => {
    const preview = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/preview').send({ metrics: ['pending_payouts'] }));
    mockC.payout.mockResolvedValue([{ _id: null, count: 99, totalAmount: 99 }]);
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send({ metrics: ['pending_payouts'], previewToken: preview.body.data.previewToken }));
    expect(res.status).toBe(202);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueJob.mock.calls[0][0]).toMatchObject({ queue: 'events-queue', type: 'ADMIN_REPORT', durable: true });
    expect(fakes.WhatsAppNotification.__rows[0].context.message).toBe(preview.body.data.message);
    expect(fakes.WhatsAppNotification.__rows[0].requestedBy).toBeDefined();
  });

  it('the same preview cannot be queued twice (double click / retry)', async () => {
    const preview = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/preview').send({ metrics: ['pending_payouts'] }));
    const body = { metrics: ['pending_payouts'], previewToken: preview.body.data.previewToken };
    mockEnqueueJob.mockResolvedValueOnce({ duplicate: false, accepted: true }).mockResolvedValue({ duplicate: true });
    const a = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send(body));
    const b = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send(body));
    expect(a.status).toBe(202);
    expect(b.status).toBe(200);
    expect(b.body.data.duplicate).toBe(true);
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(1);
  });

  it('rejects a preview token that does not match the current selection', async () => {
    const preview = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/preview').send({ metrics: ['pending_payouts'] }));
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send({ metrics: ['bought_websites'], previewToken: preview.body.data.previewToken }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PREVIEW_EXPIRED');
  });

  it.each([
    ['master switch off', { WHATSAPP_NOTIFICATIONS_ENABLED: 'false' }, 'MASTER_DISABLED'],
    ['credentials missing', { WHATSAPP_ACCESS_TOKEN: '' }, 'NOT_CONFIGURED'],
  ])('refuses to queue a report when %s (409)', async (_n, env, code) => {
    fakes.setWhatsAppEnv(env);
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send({ metrics: ['pending_payouts'] }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(code);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it('refuses when the report category is disabled in settings', async () => {
    await as(adminToken)(request(app).put('/api/admin/whatsapp/settings').send({ categories: { adminReport: false } }));
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/report/send').send({ metrics: ['pending_payouts'] }));
    expect(res.body.code).toBe('CATEGORY_DISABLED');
  });
});

describe('settings', () => {
  it('toggles notifications and categories', async () => {
    const res = await as(adminToken)(request(app).put('/api/admin/whatsapp/settings').send({ enabled: false, categories: { websitePurchase: false } }));
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({ enabled: false, categories: { subscription: true, renewal: true, websitePurchase: false, adminReport: true } });
  });
  it.each([[{ enabled: 'yes' }], [{ categories: { bogus: true } }], [{ categories: { renewal: 'x' } }], [{ categories: [] }]])('rejects invalid input %j', async (body) => {
    expect((await as(adminToken)(request(app).put('/api/admin/whatsapp/settings').send(body))).status).toBe(400);
  });
});

describe('test notification', () => {
  it('queues one test message to the configured admin, and a double click does not queue two', async () => {
    mockEnqueueJob.mockResolvedValueOnce({ duplicate: false, accepted: true }).mockResolvedValue({ duplicate: true });
    const a = await as(adminToken)(request(app).post('/api/admin/whatsapp/test'));
    const b = await as(adminToken)(request(app).post('/api/admin/whatsapp/test'));
    expect(a.status).toBe(202);
    expect(b.body.data.duplicate).toBe(true);
    expect(mockEnqueueJob.mock.calls[0][0]).toMatchObject({ type: 'WHATSAPP_TEST', queue: 'events-queue' });
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(1);
  });
  it('does nothing while the master switch is off', async () => {
    fakes.setWhatsAppEnv({ WHATSAPP_NOTIFICATIONS_ENABLED: 'false' });
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/test'))).status).toBe(409);
  });
});

describe('history and retry', () => {
  const seed = () => fakes.WhatsAppNotification.__rows.push(
    { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', eventKey: 'e1', type: 'WEBSITE_PURCHASED', category: 'websitePurchase', status: 'failed', attempts: 4, summary: 'Site · ₹10.00', failure: { code: 'WHATSAPP_AUTH_FAILED', message: 'token rejected' }, context: { message: 'SECRET BODY with ravi@example.com' }, recipientMasked: '+91******3210', createdAt: new Date() },
    { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', eventKey: 'e2', type: 'ADMIN_REPORT', category: 'adminReport', status: 'sent', attempts: 1, createdAt: new Date() },
    { _id: 'cccccccccccccccccccccccc', eventKey: 'e3', type: 'SUBSCRIPTION_PURCHASED', category: 'subscription', status: 'unconfirmed', attempts: 2, createdAt: new Date() }
  );

  it('lists delivery history, failures filterable, never exposing message bodies or customer data', async () => {
    seed();
    const res = await as(adminToken)(request(app).get('/api/admin/whatsapp/notifications?status=failed,unconfirmed'));
    expect(res.status).toBe(200);
    expect(res.body.data.notifications.map((n) => n.status).sort()).toEqual(['failed', 'unconfirmed']);
    const failed = res.body.data.notifications.find((n) => n.status === 'failed');
    expect(failed).toMatchObject({ canRetry: true, attempts: 4, failure: { code: 'WHATSAPP_AUTH_FAILED' } });
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET BODY|ravi@example\.com|919876543210/);
    expect(res.body.data.notifications.find((n) => n.status === 'unconfirmed').retryMayDuplicate).toBe(true);
  });

  it('retries a failed notification under a fresh queue key', async () => {
    seed();
    const res = await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/aaaaaaaaaaaaaaaaaaaaaaaa/retry'));
    expect(res.status).toBe(202);
    expect(mockEnqueueJob.mock.calls[0][0]).toMatchObject({ type: 'WEBSITE_PURCHASED', jobKey: 'wa-e1-r1', data: { notificationId: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });
    const row = fakes.WhatsAppNotification.__rows[0];
    expect(row).toMatchObject({ status: 'pending', manualRetries: 1 });
    expect(row.failure).toBeUndefined();
  });

  it('cannot retry a sent notification, an unknown id, or the same failure twice', async () => {
    seed();
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/bbbbbbbbbbbbbbbbbbbbbbbb/retry'))).status).toBe(409);
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/dddddddddddddddddddddddd/retry'))).status).toBe(404);
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/not-an-id/retry'))).status).toBe(404);
    await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/aaaaaaaaaaaaaaaaaaaaaaaa/retry'));
    expect((await as(adminToken)(request(app).post('/api/admin/whatsapp/notifications/aaaaaaaaaaaaaaaaaaaaaaaa/retry'))).status).toBe(409);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
  });
});
