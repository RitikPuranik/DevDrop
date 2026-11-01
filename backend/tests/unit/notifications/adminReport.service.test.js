const mockModels = {};
const model = (name, fns) => { mockModels[name] = fns; return mockModels[name]; };
jest.mock('../../../src/modules/website/website.model', () => model('Website', { countDocuments: jest.fn() }));
jest.mock('../../../src/modules/payout/payout.model', () => model('Payout', { aggregate: jest.fn() }));
jest.mock('../../../src/modules/payment/purchase.model', () => model('Purchase', { aggregate: jest.fn() }));
jest.mock('../../../src/modules/billing/models', () => ({ Subscription: model('Subscription', { aggregate: jest.fn() }), BillingOrder: model('BillingOrder', { countDocuments: jest.fn() }) }));

const svc = require('../../../src/infrastructure/notifications/adminReport.service');
const { METRIC_ORDER } = require('../../../src/infrastructure/notifications/messageTemplates');

const NOW = new Date('2026-11-01T10:00:00Z');
beforeEach(() => {
  jest.clearAllMocks();
  mockModels.Website.countDocuments.mockResolvedValue(4);
  mockModels.Payout.aggregate.mockResolvedValue([{ _id: null, count: 3, totalAmount: 4500.499999 }]);
  mockModels.Subscription.aggregate.mockResolvedValue([{ _id: 'pro', count: 3, cancelling: 1 }, { _id: 'plus', count: 2, cancelling: 0 }]);
  mockModels.BillingOrder.countDocuments.mockResolvedValue(11);
  mockModels.Purchase.aggregate.mockResolvedValue([{ _id: null, total: 10, paid: 7 }]);
});

describe('statistic definitions (database-side, no table scans)', () => {
  it('pending verifications = pending_review, non-deleted websites, via one count', async () => {
    const s = await svc.getStats(['pending_verifications'], NOW);
    expect(mockModels.Website.countDocuments).toHaveBeenCalledWith({ status: 'pending_review', isDeleted: false });
    expect(s).toEqual({ pending_verifications: { count: 4 } });
  });

  it('pending payouts match ONLY status "pending" and sum the amount in the database', async () => {
    const s = await svc.getStats(['pending_payouts'], NOW);
    const pipeline = mockModels.Payout.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { status: 'pending' } }); // completed / processing / failed / cancelled excluded
    expect(pipeline[1].$group).toMatchObject({ count: { $sum: 1 }, totalAmount: { $sum: '$amount' } });
    expect(s.pending_payouts).toEqual({ count: 3, totalAmount: 4500.5 });
  });

  it('reports zero (not an error) when nothing is pending', async () => {
    mockModels.Payout.aggregate.mockResolvedValue([]);
    mockModels.Purchase.aggregate.mockResolvedValue([]);
    const s = await svc.getStats(['pending_payouts', 'bought_websites'], NOW);
    expect(s.pending_payouts).toEqual({ count: 0, totalAmount: 0 });
    expect(s.bought_websites).toEqual({ total: 0, paid: 0, free: 0 });
  });

  it('active subscriptions only count active, unexpired subscriptions, grouped by plan', async () => {
    const s = await svc.getStats(['subscriptions'], NOW);
    const [match, group] = mockModels.Subscription.aggregate.mock.calls[0][0];
    expect(match.$match.status).toBe('active');
    expect(match.$match.currentPeriodEnd.$gt).toEqual(NOW); // BILLING_GRACE_DAYS defaults to 0
    expect(group.$group._id).toBe('$planId');
    expect(s.subscriptions).toMatchObject({ totalActive: 5, cancelling: 1, historicalPurchases: 11 });
    expect(s.subscriptions.byPlan).toEqual([{ planId: 'pro', name: expect.any(String), count: 3 }, { planId: 'plus', name: expect.any(String), count: 2 }]);
  });

  it('historical purchases are finalized paid orders, kept separate from active subscriptions', async () => {
    await svc.getStats(['subscriptions'], NOW);
    expect(mockModels.BillingOrder.countDocuments).toHaveBeenCalledWith({ status: 'paid', appliedAt: { $ne: null } });
  });

  it('extends the active window by the configured grace days', async () => {
    process.env.BILLING_GRACE_DAYS = '3';
    await svc.getStats(['subscriptions'], NOW);
    delete process.env.BILLING_GRACE_DAYS;
    const match = mockModels.Subscription.aggregate.mock.calls[0][0][0].$match;
    expect(match.currentPeriodEnd.$gt).toEqual(new Date(NOW.getTime() - 3 * 86400000));
  });

  it('never drops a subscription whose plan is missing from the catalogue', async () => {
    mockModels.Subscription.aggregate.mockResolvedValue([{ _id: 'legacy', count: 2, cancelling: 0 }]);
    const s = await svc.getStats(['subscriptions'], NOW);
    expect(s.subscriptions.totalActive).toBe(2);
    expect(s.subscriptions.byPlan.find((p) => p.planId === 'legacy').count).toBe(2);
  });

  it('bought websites count completed purchases only (pending / failed / cancelled never match)', async () => {
    const s = await svc.getStats(['bought_websites'], NOW);
    expect(mockModels.Purchase.aggregate.mock.calls[0][0][0]).toEqual({ $match: { paymentStatus: 'completed' } });
    expect(s.bought_websites).toEqual({ total: 10, paid: 7, free: 3 });
  });

  it('runs only the selected statistics', async () => {
    await svc.getStats(['pending_verifications'], NOW);
    expect(mockModels.Payout.aggregate).not.toHaveBeenCalled();
    expect(mockModels.Subscription.aggregate).not.toHaveBeenCalled();
    expect(mockModels.Purchase.aggregate).not.toHaveBeenCalled();
  });
});

describe('metric selection', () => {
  it('normalises, de-duplicates and orders selections; rejects anything else', () => {
    expect(svc.normalizeMetrics(['bought_websites', 'pending_payouts', 'pending_payouts'])).toEqual(['pending_payouts', 'bought_websites']);
    expect(svc.normalizeMetrics(METRIC_ORDER)).toEqual(METRIC_ORDER);
    expect(svc.normalizeMetrics([])).toBeNull();
    expect(svc.normalizeMetrics(['users'])).toBeNull();
    expect(svc.normalizeMetrics('pending_payouts')).toBeNull();
    expect(svc.normalizeMetrics(undefined)).toBeNull();
  });
});

describe('report message and preview token', () => {
  it('builds a message containing only the selected statistics', async () => {
    const r = await svc.buildReport(['pending_verifications', 'bought_websites'], NOW);
    expect(r.message).toContain('Pending Website Verifications:* 4');
    expect(r.message).toContain('Total Bought Websites:* 10');
    expect(r.message).not.toContain('Pending Payouts');
  });

  it('sends exactly what was previewed: the token carries the snapshot', async () => {
    const report = await svc.buildReport(['pending_payouts'], NOW);
    const token = svc.signPreview(report, 'admin1');
    mockModels.Payout.aggregate.mockResolvedValue([{ count: 99, totalAmount: 1 }]); // data changes after the preview
    const snap = svc.readPreview(token, 'admin1', ['pending_payouts']);
    expect(svc.messageFromSnapshot(snap)).toBe(report.message);
  });

  it('rejects a token from another admin, for other metrics, tampered, or expired', async () => {
    const report = await svc.buildReport(['pending_payouts'], NOW);
    const token = svc.signPreview(report, 'admin1');
    expect(svc.readPreview(token, 'admin2', ['pending_payouts'])).toBeNull();
    expect(svc.readPreview(token, 'admin1', ['bought_websites'])).toBeNull();
    expect(svc.readPreview(`${token}x`, 'admin1', ['pending_payouts'])).toBeNull();
    expect(svc.readPreview('garbage', 'admin1', ['pending_payouts'])).toBeNull();
    jest.useFakeTimers().setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(svc.readPreview(token, 'admin1', ['pending_payouts'])).toBeNull();
    jest.useRealTimers();
  });
});
