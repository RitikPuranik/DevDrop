const mockEnqueue = jest.fn().mockResolvedValue({ accepted: true });
jest.mock('../../../src/infrastructure/queue/queues', () => ({ enqueueJob: (...a) => mockEnqueue(...a) }));
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('./mockQueueJob'));

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
const cryptoUtil = require('../../../src/shared/utils/crypto');
const jobs = require('../../../src/infrastructure/events/emailJobs');
const { PRIORITY } = require('../../../src/infrastructure/queue/names');
const QueueJob = require('../../../src/infrastructure/queue/queueJob.model');

beforeEach(() => { jest.clearAllMocks(); QueueJob.__reset(); });

describe('security emails (verification / password reset)', () => {
  it.each([['enqueueVerificationEmail', 'EMAIL_VERIFICATION'], ['enqueuePasswordResetEmail', 'EMAIL_PASSWORD_RESET']])('%s: top priority, short expiry, never raw token in key or payload', async (fn, type) => {
    const raw = 'rawtoken-abcdef0123456789';
    await jobs[fn]({ _id: 'u1' }, raw);
    const arg = mockEnqueue.mock.calls[0][0];
    expect(arg.type).toBe(type);
    expect(arg.priority).toBe(PRIORITY.SECURITY);
    expect(arg.durable).toBeUndefined(); // secrets are not persisted for later: fail the request instead
    expect(arg.jobKey).not.toContain(raw);
    expect(JSON.stringify(arg.data)).not.toContain(raw);
    expect(cryptoUtil.decrypt(arg.data.tokenEnc)).toBe(raw);
    expect(arg.data.notAfter).toBeGreaterThan(Date.now());
    expect(arg.data.notAfter).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
    expect(arg.attempts).toBeLessThanOrEqual(2); // short bounded retry policy
  });

  it('cooldown helper detects a recent request', async () => {
    expect(await jobs.verificationEmailRecentlyRequested('u1')).toBe(false);
    QueueJob.__docs.set('x', { jobKey: 'x', type: 'EMAIL_VERIFICATION', userId: 'u1', status: 'queued', createdAt: new Date() });
    expect(await jobs.verificationEmailRecentlyRequested('u1')).toBe(true);
  });
});

describe('business-event emails are durable and idempotent by record id', () => {
  it('welcome email: one job per user', async () => {
    await jobs.enqueueWelcomeEmail('u1');
    const arg = mockEnqueue.mock.calls[0][0];
    expect(arg).toMatchObject({ type: 'EMAIL_WELCOME', jobKey: 'email-welcome-u1', durable: true, queue: 'events-queue' });
    expect(arg.priority).toBeGreaterThan(PRIORITY.SECURITY); // ordinary emails never outrank security ones
  });

  it('outbid: one job per accepted bid, carrying ids only', async () => {
    await jobs.enqueueOutbidNotification({ bidId: 'b9', websiteId: 'w1', previousBidderId: 'u2', bidAmount: 500 });
    const arg = mockEnqueue.mock.calls[0][0];
    expect(arg.jobKey).toBe('email-outbid-b9');
    expect(arg.data).toEqual({ bidId: 'b9', websiteId: 'w1', previousBidderId: 'u2', bidAmount: 500 });
    expect(arg.durable).toBe(true);
  });

  it('purchase + seller emails are keyed per purchase', async () => {
    await jobs.enqueuePurchaseConfirmation('p1', 'buyer');
    await jobs.enqueueSellerNotification('p1', 'seller');
    expect(mockEnqueue.mock.calls.map((c) => c[0].jobKey)).toEqual(['email-purchase-p1', 'email-seller-sale-p1']);
  });

  it('admin alerts truncate oversized text', async () => {
    await jobs.enqueueAdminAlert({ subject: 's', message: 'm', details: 'x'.repeat(10000) });
    expect(mockEnqueue.mock.calls[0][0].data.details.length).toBeLessThanOrEqual(4000);
  });
});
