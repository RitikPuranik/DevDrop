jest.mock('../../../src/infrastructure/notifications/whatsappNotification.model', () => require('../../helpers/whatsappFakes').WhatsAppNotification);
jest.mock('../../../src/infrastructure/notifications/whatsappSettings.model', () => require('../../helpers/whatsappFakes').WhatsAppSettings);
const mockEnqueueJob = jest.fn();
jest.mock('../../../src/infrastructure/queue/queues', () => ({ enqueueJob: (...a) => mockEnqueueJob(...a) }));

const fakes = require('../../helpers/whatsappFakes');
const producers = require('../../../src/infrastructure/notifications/notificationEvents');

const paidOrder = (over = {}) => ({ _id: 'order1', status: 'paid', kind: 'new', appliedAt: new Date(), planId: 'pro', ...over });
const purchase = (over = {}) => ({ _id: 'pur1', paymentStatus: 'completed', category: 'paid', totalPaid: 999, ...over });

beforeEach(() => {
  fakes.reset();
  jest.clearAllMocks();
  fakes.setWhatsAppEnv();
  mockEnqueueJob.mockImplementation(async () => ({ duplicate: false, accepted: true }));
});
afterAll(fakes.clearWhatsAppEnv);

describe('subscription notifications', () => {
  it('enqueues one SUBSCRIPTION_PURCHASED job on the events queue, by reference, through the durable outbox', async () => {
    const r = await producers.notifySubscriptionPaid(paidOrder());
    expect(r.enqueued).toBe(true);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    const arg = mockEnqueueJob.mock.calls[0][0];
    expect(arg).toMatchObject({ queue: 'events-queue', type: 'SUBSCRIPTION_PURCHASED', jobKey: 'wa-sub-paid-order1', durable: true, attempts: 4 });
    expect(arg.data).toEqual({ notificationId: expect.any(String) }); // ids only: no name, e-mail or amount in Redis
    expect(fakes.WhatsAppNotification.__rows[0]).toMatchObject({ eventKey: 'sub-paid-order1', type: 'SUBSCRIPTION_PURCHASED', category: 'subscription', status: 'pending', recipientMasked: '+91******3210' });
  });

  it('treats a renewal as its own event type and category', async () => {
    await producers.notifySubscriptionPaid(paidOrder({ _id: 'order2', kind: 'renewal' }));
    expect(mockEnqueueJob.mock.calls[0][0]).toMatchObject({ type: 'SUBSCRIPTION_RENEWED', jobKey: 'wa-sub-paid-order2' });
    expect(fakes.WhatsAppNotification.__rows[0].category).toBe('renewal');
  });

  it('treats an upgrade like a purchase (not a renewal)', async () => {
    await producers.notifySubscriptionPaid(paidOrder({ kind: 'upgrade' }));
    expect(mockEnqueueJob.mock.calls[0][0].type).toBe('SUBSCRIPTION_PURCHASED');
  });

  it.each([
    ['unpaid / abandoned checkout', { status: 'created', appliedAt: null }],
    ['failed payment', { status: 'failed', appliedAt: null }],
    ['cancelled checkout', { status: 'cancelled', appliedAt: null }],
    ['expired checkout', { status: 'expired', appliedAt: null }],
    ['paid but entitlement not applied yet', { status: 'paid', appliedAt: null }],
    ['paid but superseded by a higher plan (no subscription granted)', { failureReason: 'superseded_by_higher_plan' }],
  ])('sends nothing for %s', async (_n, over) => {
    const r = await producers.notifySubscriptionPaid(paidOrder(over));
    expect(r.enqueued).toBe(false);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(0);
  });

  it('is idempotent: webhook + verify + poll + refresh produce ONE logical notification', async () => {
    mockEnqueueJob.mockResolvedValueOnce({ duplicate: false, accepted: true }).mockResolvedValue({ duplicate: true, status: 'queued' });
    const results = [];
    for (let i = 0; i < 5; i += 1) results.push(await producers.notifySubscriptionPaid(paidOrder()));
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(1);
    expect(new Set(mockEnqueueJob.mock.calls.map((c) => c[0].jobKey))).toEqual(new Set(['wa-sub-paid-order1']));
    expect(results.filter((r) => r.enqueued)).toHaveLength(1);
    expect(results.slice(1).every((r) => r.duplicate)).toBe(true);
  });

  it('repairs a half-finished enqueue: record exists but the job was never created', async () => {
    fakes.WhatsAppNotification.__rows.push({ _id: 'n1', eventKey: 'sub-paid-order1', type: 'SUBSCRIPTION_PURCHASED', status: 'pending' });
    await producers.notifySubscriptionPaid(paidOrder());
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(1);
    expect(mockEnqueueJob.mock.calls[0][0].data.notificationId).toBe('n1');
  });
});

describe('website purchase notifications', () => {
  it('enqueues one WEBSITE_PURCHASED job for a completed purchase, keyed by the purchase', async () => {
    const r = await producers.notifyWebsitePurchased(purchase());
    expect(r.enqueued).toBe(true);
    expect(mockEnqueueJob.mock.calls[0][0]).toMatchObject({ queue: 'events-queue', type: 'WEBSITE_PURCHASED', jobKey: 'wa-web-purchase-pur1', durable: true });
    expect(fakes.WhatsAppNotification.__rows[0]).toMatchObject({ eventKey: 'web-purchase-pur1', category: 'websitePurchase', refType: 'purchase', refId: 'pur1' });
  });

  it.each([['pending', 'pending'], ['failed', 'failed']])('sends nothing for a %s purchase', async (_n, paymentStatus) => {
    expect((await producers.notifyWebsitePurchased(purchase({ paymentStatus }))).enqueued).toBe(false);
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it('replayed payment confirmations do not create a second notification', async () => {
    mockEnqueueJob.mockResolvedValueOnce({ duplicate: false, accepted: true }).mockResolvedValue({ duplicate: true });
    await producers.notifyWebsitePurchased(purchase());
    await producers.notifyWebsitePurchased(purchase());
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(1);
  });

  it('skips free-template claims by default, but can be switched on', async () => {
    const free = purchase({ _id: 'free1', category: 'free', totalPaid: 0 });
    expect((await producers.notifyWebsitePurchased(free)).reason).toBe('free_claim');
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    fakes.setWhatsAppEnv({ WHATSAPP_NOTIFY_FREE_CLAIMS: 'true' });
    expect((await producers.notifyWebsitePurchased(free)).enqueued).toBe(true);
  });

  it('still alerts for a paid listing that a coupon made free', async () => {
    expect((await producers.notifyWebsitePurchased(purchase({ category: 'paid', totalPaid: 0 }))).enqueued).toBe(true);
  });
});

describe('switches', () => {
  it('master switch off (default): nothing is recorded or queued', async () => {
    fakes.setWhatsAppEnv({ WHATSAPP_NOTIFICATIONS_ENABLED: 'false' });
    expect((await producers.notifySubscriptionPaid(paidOrder())).reason).toBe('master_disabled');
    expect((await producers.notifyWebsitePurchased(purchase())).reason).toBe('master_disabled');
    expect(mockEnqueueJob).not.toHaveBeenCalled();
    expect(fakes.WhatsAppNotification.__rows).toHaveLength(0);
  });

  it('admin toggle off, and per-category toggles, are honoured', async () => {
    fakes.WhatsAppSettings.__rows.push({ _id: 's', key: 'whatsapp', enabled: true, categories: { subscription: false, renewal: true, websitePurchase: true, adminReport: true } });
    expect((await producers.notifySubscriptionPaid(paidOrder())).reason).toBe('category_disabled');
    expect((await producers.notifySubscriptionPaid(paidOrder({ _id: 'o9', kind: 'renewal' }))).enqueued).toBe(true);
    fakes.WhatsAppSettings.__rows[0].enabled = false;
    expect((await producers.notifyWebsitePurchased(purchase())).reason).toBe('disabled');
  });

  it('missing credentials do not drop the alert: it is recorded so it can fail visibly and be retried', async () => {
    fakes.setWhatsAppEnv({ WHATSAPP_ACCESS_TOKEN: '' });
    expect((await producers.notifyWebsitePurchased(purchase())).enqueued).toBe(true);
  });
});

describe('queue failure isolation', () => {
  it('never throws into the business flow when the queue or database fails', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueueJob.mockRejectedValue(Object.assign(new Error('redis down'), { code: 'QUEUE_UNAVAILABLE' }));
    await expect(producers.notifySubscriptionPaid(paidOrder())).resolves.toMatchObject({ enqueued: false, error: true });
    await expect(producers.notifyWebsitePurchased(purchase())).resolves.toMatchObject({ enqueued: false, error: true });
    fakes.WhatsAppNotification.create.mockRejectedValueOnce(new Error('mongo down'));
    await expect(producers.notifySubscriptionPaid(paidOrder({ _id: 'o5' }))).resolves.toMatchObject({ error: true });
    err.mockRestore();
  });

  it('reports a Redis outage as accepted-but-pending (durable outbox republishes it later)', async () => {
    mockEnqueueJob.mockResolvedValue({ duplicate: false, accepted: false, pending: true });
    expect(await producers.notifySubscriptionPaid(paidOrder())).toMatchObject({ enqueued: true, queued: false });
  });
});
