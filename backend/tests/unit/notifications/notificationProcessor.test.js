jest.mock('../../../src/infrastructure/notifications/whatsappNotification.model', () => require('../../helpers/whatsappFakes').WhatsAppNotification);
jest.mock('../../../src/infrastructure/notifications/whatsappSettings.model', () => require('../../helpers/whatsappFakes').WhatsAppSettings);
jest.mock('../../../src/modules/user/user.model', () => require('../../helpers/whatsappFakes').User);
jest.mock('../../../src/modules/website/website.model', () => require('../../helpers/whatsappFakes').Website);
jest.mock('../../../src/modules/payment/purchase.model', () => require('../../helpers/whatsappFakes').Purchase);
jest.mock('../../../src/modules/payment/payment.model', () => require('../../helpers/whatsappFakes').Payment);
jest.mock('../../../src/modules/billing/models', () => { const f = require('../../helpers/billingFakes'); return { Subscription: f.Subscription, BillingOrder: f.BillingOrder }; });
const mockSend = jest.fn();
jest.mock('../../../src/infrastructure/notifications/whatsappCloud.service', () => ({ ...jest.requireActual('../../../src/infrastructure/notifications/whatsappCloud.service'), sendAdminText: (...a) => mockSend(...a) }));

const fakes = require('../../helpers/whatsappFakes');
const billing = require('../../helpers/billingFakes');
const { WhatsAppSendError } = require('../../../src/infrastructure/notifications/whatsappCloud.service');
const { processWhatsAppJob, onWhatsAppFinalFailure } = require('../../../src/infrastructure/notifications/notificationProcessor');
const { UnrecoverableError } = require('../../../src/infrastructure/queue/errors');

const T = new Date('2026-11-01T10:15:00Z');
const job = (notificationId, { attemptsMade = 0, attempts = 4, name = 'SUBSCRIPTION_PURCHASED' } = {}) => ({ name, data: { notificationId }, attemptsMade, opts: { attempts } });
const rec = (id = 'n1') => fakes.WhatsAppNotification.__rows.find((r) => r._id === id);
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
const apiError = (opts) => new WhatsAppSendError('boom', opts);

const seedSubscription = (over = {}) => {
  fakes.User.__rows.push({ _id: 'u1', name: 'Asha Rao', email: 'asha@example.com' });
  billing.Subscription.__rows.push({ _id: 'subDoc1', userId: 'u1', planId: 'pro' });
  billing.BillingOrder.__rows.push({ _id: 'order1', userId: 'u1', planId: 'pro', kind: 'new', status: 'paid', appliedAt: T, paidAt: T, amountMinor: 79900, currency: 'INR', ...over });
  fakes.WhatsAppNotification.__rows.push({ _id: 'n1', eventKey: 'sub-paid-order1', type: 'SUBSCRIPTION_PURCHASED', category: 'subscription', refType: 'billing_order', refId: 'order1', status: 'pending', attempts: 0, ambiguousAttempts: 0 });
};
const seedWebsite = (over = {}, { seller = true } = {}) => {
  fakes.User.__rows.push({ _id: 'buyer1', name: 'Ravi', email: 'ravi@example.com' });
  if (seller) fakes.User.__rows.push({ _id: 'seller1', name: 'Meera', email: 'meera@example.com' });
  fakes.Website.__rows.push({ _id: 'web1', name: 'Portfolio Pro' });
  fakes.Purchase.__rows.push({ _id: 'pur1', websiteId: 'web1', buyerId: 'buyer1', sellerId: seller ? 'seller1' : undefined, category: 'paid', totalPaid: 1999, paymentStatus: 'completed', razorpayOrderId: 'order_RZP9', purchaseDate: T, ...over });
  fakes.WhatsAppNotification.__rows.push({ _id: 'n2', eventKey: 'web-purchase-pur1', type: 'WEBSITE_PURCHASED', category: 'websitePurchase', refType: 'purchase', refId: 'pur1', status: 'pending', attempts: 0, ambiguousAttempts: 0 });
};

beforeEach(() => {
  fakes.reset(); billing.reset(); jest.clearAllMocks(); mockSend.mockReset();
  fakes.setWhatsAppEnv();
  mockSend.mockResolvedValue({ messageId: 'wamid.OK' });
});
afterAll(fakes.clearWhatsAppEnv);

describe('successful delivery', () => {
  it('sends the exact subscription message built from backend state and records the delivery', async () => {
    seedSubscription();
    const out = await processWhatsAppJob(job('n1'));
    expect(mockSend).toHaveBeenCalledTimes(1);
    const text = mockSend.mock.calls[0][0];
    expect(text).toContain('🔔 *DevDrop | New Subscription*');
    expect(text).toContain('📦 *Plan:* Pro');
    expect(text).toContain('👤 *User:* Asha Rao');
    expect(text).toContain('📧 *Email:* asha@example.com');
    expect(text).toContain('💰 *Amount:* ₹799.00');
    expect(text).toContain('💳 *Payment:* Paid');
    expect(text).toContain('🆔 *Subscription ID:* subDoc1');
    expect(text).toMatch(/📅 \*Date:\* 1 Nov 2026, 3:45\s?pm IST/i);
    expect(out.delivery.providerMessageId).toBe('wamid.OK');
    expect(rec()).toMatchObject({ status: 'sent', providerMessageId: 'wamid.OK', attempts: 1, summary: 'Pro · ₹799.00' });
    expect(rec().sentAt).toBeInstanceOf(Date);
    expect(rec().failure).toBeUndefined();
  });

  it('sends the website purchase message with seller, buyer and the order id', async () => {
    seedWebsite();
    await processWhatsAppJob(job('n2', { name: 'WEBSITE_PURCHASED' }));
    const text = mockSend.mock.calls[0][0];
    expect(text).toContain('🌐 *Website:* Portfolio Pro');
    expect(text).toContain('👤 *Buyer:* Ravi');
    expect(text).toContain('📧 *Buyer Email:* ravi@example.com');
    expect(text).toContain('👨‍💻 *Seller:* Meera');
    expect(text).toContain('💰 *Purchase Amount:* ₹1,999.00');
    expect(text).toContain('🆔 *Order ID:* order_RZP9');
    expect(rec('n2').status).toBe('sent');
  });

  it('falls back to "Unavailable" when the seller is missing or deleted, and still sends', async () => {
    seedWebsite({}, { seller: false });
    await processWhatsAppJob(job('n2', { name: 'WEBSITE_PURCHASED' }));
    expect(mockSend.mock.calls[0][0]).toContain('👨‍💻 *Seller:* Unavailable');
    expect(rec('n2').status).toBe('sent');

    fakes.reset(); seedWebsite({}, { seller: true });
    fakes.User.__rows.splice(fakes.User.__rows.findIndex((u) => u._id === 'seller1'), 1); // seller account deleted later
    await processWhatsAppJob(job('n2', { name: 'WEBSITE_PURCHASED' }));
    expect(mockSend.mock.calls[1][0]).toContain('*Seller:* Unavailable');
  });

  it('uses the purchase id as the order id when there is no gateway order (coupon-covered / free)', async () => {
    seedWebsite({ razorpayOrderId: undefined, totalPaid: 0, couponCode: 'FREE100' });
    await processWhatsAppJob(job('n2', { name: 'WEBSITE_PURCHASED' }));
    const text = mockSend.mock.calls[0][0];
    expect(text).toContain('🆔 *Order ID:* pur1');
    expect(text).toContain('💳 *Payment:* No payment required');
  });

  it('renders a renewal with the renewal message', async () => {
    seedSubscription({ kind: 'renewal' });
    rec().type = 'SUBSCRIPTION_RENEWED';
    await processWhatsAppJob(job('n1', { name: 'SUBSCRIPTION_RENEWED' }));
    expect(mockSend.mock.calls[0][0]).toContain('Subscription Renewed');
  });

  it('keeps customer details out of the stored history row', async () => {
    seedSubscription();
    await processWhatsAppJob(job('n1'));
    expect(JSON.stringify(rec())).not.toMatch(/asha@example\.com|Asha Rao|919876543210/);
  });
});

describe('duplicate prevention at the worker', () => {
  it('never re-sends a notification that was already sent (job replay, stalled-job recovery, worker restart)', async () => {
    seedSubscription();
    await processWhatsAppJob(job('n1'));
    const again = await processWhatsAppJob(job('n1', { attemptsMade: 1 }));
    await processWhatsAppJob(job('n1', { attemptsMade: 2 }));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(again.result).toMatchObject({ sent: true, duplicate: true });
  });

  it('two attempts racing for the same notification send exactly once', async () => {
    seedSubscription();
    mockSend.mockImplementation(async () => { await new Promise((r) => setImmediate(r)); return { messageId: 'wamid.RACE' }; });
    const [a, b] = await Promise.all([processWhatsAppJob(job('n1')), processWhatsAppJob(job('n1'))]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect([a, b].filter((o) => o.result?.reason === 'in_flight_elsewhere')).toHaveLength(1);
    expect(rec().status).toBe('sent');
  });
});

describe('state is re-verified at send time', () => {
  it.each([
    ['order is no longer paid', { status: 'failed' }, 'order_not_confirmed'],
    ['entitlement was never applied', { appliedAt: null }, 'order_not_confirmed'],
    ['order was superseded', { failureReason: 'superseded_by_higher_plan' }, 'order_not_applied'],
  ])('skips a subscription alert when %s', async (_n, over, reason) => {
    seedSubscription(over);
    const out = await processWhatsAppJob(job('n1'));
    expect(mockSend).not.toHaveBeenCalled();
    expect(out.result).toMatchObject({ skipped: true, reason });
    expect(rec()).toMatchObject({ status: 'skipped', skippedReason: reason });
  });

  it('skips a website alert when the purchase is not completed', async () => {
    seedWebsite({ paymentStatus: 'failed' });
    await processWhatsAppJob(job('n2', { name: 'WEBSITE_PURCHASED' }));
    expect(mockSend).not.toHaveBeenCalled();
    expect(rec('n2').skippedReason).toBe('purchase_not_completed');
  });

  it('skips (does not fail) when notifications were switched off while the job waited', async () => {
    seedSubscription();
    fakes.setWhatsAppEnv({ WHATSAPP_NOTIFICATIONS_ENABLED: 'false' });
    const out = await processWhatsAppJob(job('n1'));
    expect(out.result.skipped).toBe(true);
    expect(rec().skippedReason).toBe('master_disabled');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('skips when the admin disabled that category in the meantime', async () => {
    seedSubscription();
    fakes.WhatsAppSettings.__rows.push({ _id: 's', key: 'whatsapp', enabled: true, categories: { subscription: false } });
    await processWhatsAppJob(job('n1'));
    expect(rec().skippedReason).toBe('category_disabled');
  });

  it('fails visibly (and retryably by an admin) when credentials are missing', async () => {
    seedSubscription();
    fakes.setWhatsAppEnv({ WHATSAPP_PHONE_NUMBER_ID: '' });
    const e = await err(processWhatsAppJob(job('n1')));
    expect(e).toBeInstanceOf(UnrecoverableError);
    expect(rec()).toMatchObject({ status: 'failed', failure: { code: 'WHATSAPP_NOT_CONFIGURED' } });
  });
});

describe('bounded retries', () => {
  it('a definite transient failure goes back to pending and asks the queue to retry (exponential backoff is the queue policy)', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(apiError({ code: 'WHATSAPP_SERVER_ERROR', retryable: true }));
    const e = await err(processWhatsAppJob(job('n1', { attemptsMade: 0 })));
    expect(e.failureClass).toBe('transient');
    expect(e).not.toBeInstanceOf(UnrecoverableError);
    expect(rec()).toMatchObject({ status: 'pending', attempts: 1, failure: { code: 'WHATSAPP_SERVER_ERROR', retryable: true } });
  });

  it('retries a definite failure until the attempt budget is spent, then stops as "failed"', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(apiError({ code: 'WHATSAPP_RATE_LIMITED', retryable: true }));
    for (let attemptsMade = 0; attemptsMade < 4; attemptsMade += 1) {
      const e = await err(processWhatsAppJob(job('n1', { attemptsMade, attempts: 4 })));
      expect(e).toBeTruthy();
      if (attemptsMade < 3) expect(rec().status).toBe('pending');
    }
    expect(mockSend).toHaveBeenCalledTimes(4); // never more than `attempts`
    expect(rec()).toMatchObject({ status: 'failed', attempts: 4 });
  });

  it('a permanent failure is never retried', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(apiError({ code: 'WHATSAPP_AUTH_FAILED', retryable: false }));
    const e = await err(processWhatsAppJob(job('n1')));
    expect(e).toBeInstanceOf(UnrecoverableError);
    expect(rec()).toMatchObject({ status: 'failed', failure: { code: 'WHATSAPP_AUTH_FAILED', retryable: false } });
  });

  it('recovers: fails once, then succeeds on the retry, and ends "sent" with the attempts recorded', async () => {
    seedSubscription();
    mockSend.mockRejectedValueOnce(apiError({ code: 'WHATSAPP_UNREACHABLE', retryable: true })).mockResolvedValueOnce({ messageId: 'wamid.2' });
    await err(processWhatsAppJob(job('n1', { attemptsMade: 0 })));
    await processWhatsAppJob(job('n1', { attemptsMade: 1 }));
    expect(rec()).toMatchObject({ status: 'sent', attempts: 2, providerMessageId: 'wamid.2' });
    expect(rec().failure).toBeUndefined();
  });

  it('stores failure reasons without secrets or phone numbers', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(apiError({ code: 'WHATSAPP_REJECTED', retryable: false }));
    mockSend.mockRejectedValue(new WhatsAppSendError(`bad ${'919876543210'} ${'EAAsecrettoken1234567890'}`, { code: 'WHATSAPP_REJECTED', retryable: false }));
    await err(processWhatsAppJob(job('n1')));
    expect(rec().failure.message).not.toContain('919876543210');
    expect(rec().failure.message).not.toContain('EAAsecrettoken1234567890');
  });
});

describe('ambiguous outcomes (request sent, no answer)', () => {
  const timeout = () => apiError({ code: 'WHATSAPP_NO_RESPONSE', retryable: true, ambiguous: true });

  it('allows ONE automatic re-send after a timeout, then parks the notification as "unconfirmed"', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(timeout());
    const first = await err(processWhatsAppJob(job('n1', { attemptsMade: 0 })));
    expect(first).not.toBeInstanceOf(UnrecoverableError);
    expect(rec()).toMatchObject({ status: 'pending', ambiguousAttempts: 1 });

    const second = await err(processWhatsAppJob(job('n1', { attemptsMade: 1 })));
    expect(second).toBeInstanceOf(UnrecoverableError); // no more automatic retries
    expect(rec()).toMatchObject({ status: 'unconfirmed', ambiguousAttempts: 2, failure: { ambiguous: true } });
    expect(mockSend).toHaveBeenCalledTimes(2); // at most one potential duplicate

    await err(processWhatsAppJob(job('n1', { attemptsMade: 2 })));
    expect(mockSend).toHaveBeenCalledTimes(2); // and never again without a human
  });

  it('with WHATSAPP_MAX_AMBIGUOUS_RETRIES=0 a timeout is never re-sent automatically', async () => {
    seedSubscription();
    fakes.setWhatsAppEnv({ WHATSAPP_MAX_AMBIGUOUS_RETRIES: '0' });
    mockSend.mockRejectedValue(timeout());
    const e = await err(processWhatsAppJob(job('n1')));
    expect(e).toBeInstanceOf(UnrecoverableError);
    expect(rec().status).toBe('unconfirmed');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('a timeout on the final attempt is "unconfirmed", not "failed" (it may have been delivered)', async () => {
    seedSubscription();
    mockSend.mockRejectedValue(timeout());
    await err(processWhatsAppJob(job('n1', { attemptsMade: 3, attempts: 4 })));
    expect(rec().status).toBe('unconfirmed');
  });

  it('a worker crash after the API call leaves "sending"; the next attempt counts as ambiguous and is capped', async () => {
    seedSubscription();
    Object.assign(rec(), { status: 'sending', attempts: 1, lastAttemptAt: new Date(Date.now() - 120000) }); // previous worker died before recording the outcome
    await processWhatsAppJob(job('n1', { attemptsMade: 1 }));
    expect(mockSend).toHaveBeenCalledTimes(1); // one allowed re-send
    expect(rec()).toMatchObject({ status: 'sent', ambiguousAttempts: 1 });

    fakes.reset(); billing.reset(); jest.clearAllMocks();
    seedSubscription();
    Object.assign(rec(), { status: 'sending', ambiguousAttempts: 1, lastAttemptAt: new Date(Date.now() - 120000) }); // already used the allowance once
    const e = await err(processWhatsAppJob(job('n1', { attemptsMade: 2 })));
    expect(e).toBeInstanceOf(UnrecoverableError);
    expect(mockSend).not.toHaveBeenCalled();
    expect(rec().status).toBe('unconfirmed');
  });
});

describe('admin report and test jobs', () => {
  it('sends the previewed report text verbatim (not regenerated)', async () => {
    fakes.WhatsAppNotification.__rows.push({ _id: 'r1', eventKey: 'report-a-1', type: 'ADMIN_REPORT', category: 'adminReport', status: 'pending', context: { message: 'EXACT PREVIEWED TEXT', metrics: ['pending_payouts'] } });
    await processWhatsAppJob(job('r1', { name: 'ADMIN_REPORT' }));
    expect(mockSend).toHaveBeenCalledWith('EXACT PREVIEWED TEXT');
    expect(rec('r1')).toMatchObject({ status: 'sent', summary: 'Report: 1 metric(s)' });
  });

  it('sends a test message even when business categories are disabled, but not when the master switch is off', async () => {
    fakes.WhatsAppSettings.__rows.push({ _id: 's', key: 'whatsapp', enabled: false, categories: {} });
    fakes.WhatsAppNotification.__rows.push({ _id: 't1', eventKey: 'test-a-1', type: 'WHATSAPP_TEST', category: 'test', status: 'pending', context: {} });
    await processWhatsAppJob(job('t1', { name: 'WHATSAPP_TEST' }));
    expect(mockSend.mock.calls[0][0]).toContain('Test Notification');
    expect(rec('t1').status).toBe('sent');

    fakes.WhatsAppNotification.__rows.push({ _id: 't2', eventKey: 'test-a-2', type: 'WHATSAPP_TEST', category: 'test', status: 'pending', context: {} });
    fakes.setWhatsAppEnv({ WHATSAPP_NOTIFICATIONS_ENABLED: 'false' });
    await processWhatsAppJob(job('t2', { name: 'WHATSAPP_TEST' }));
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(rec('t2').status).toBe('skipped');
  });
});

describe('final-failure hook (crash / timeout / stalled recovery)', () => {
  it('parks a stuck "sending" record as unconfirmed and a waiting "pending" one as failed, never touching "sent"', async () => {
    fakes.WhatsAppNotification.__rows.push(
      { _id: 'a', status: 'sending', eventKey: 'a' }, { _id: 'b', status: 'pending', eventKey: 'b' }, { _id: 'c', status: 'sent', eventKey: 'c' }
    );
    const e = Object.assign(new Error('job stalled more than allowable limit'), { code: 'X' });
    for (const id of ['a', 'b', 'c']) await onWhatsAppFinalFailure({ data: { notificationId: id } }, e);
    expect(rec('a')).toMatchObject({ status: 'unconfirmed', failure: { ambiguous: true } });
    expect(rec('b').status).toBe('failed');
    expect(rec('c').status).toBe('sent');
  });
});
