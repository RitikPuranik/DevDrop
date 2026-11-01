const fakes = require('../../helpers/billingFakes');
jest.mock('../../../src/modules/billing/models', () => { const f = require('../../helpers/billingFakes'); return { Subscription: f.Subscription, BillingOrder: f.BillingOrder, UsageCounter: f.UsageCounter, GenerationLedger: f.GenerationLedger, CouponRedemption: f.CouponRedemption }; });
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('../infrastructure/mockQueueJob'));

// Lets a test simulate a plan that grants no generations (no env switch exists for this in production).
let mockFreeQuota;
jest.mock('../../../src/modules/billing/plans.config', () => {
  const actual = jest.requireActual('../../../src/modules/billing/plans.config');
  return { ...actual, getPlans: (env) => { const p = actual.getPlans(env); if (mockFreeQuota !== undefined) p.free.generationQuota = mockFreeQuota; return p; } };
});
const QueueJob = require('../infrastructure/mockQueueJob');
const ent = require('../../../src/modules/billing/entitlement.service');

const U = 'user-1';
const T0 = new Date('2026-11-01T10:00:00Z');
const seedSub = (over = {}) => fakes.Subscription.__rows.push(Object.assign({ _id: 'sub1', userId: U, planId: 'pro', interval: 'monthly', status: 'active', termStart: T0, currentPeriodEnd: new Date('2026-12-01T10:00:00Z'), quotaAnchor: T0, cancelAtPeriodEnd: false, endReason: null, createdAt: T0, updatedAt: T0 }, over));
const code = async (p) => { try { await p; return null; } catch (e) { return e.code || `other:${e.message}`; } };
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };
let n = 0;
const key = () => `job-${++n}`;
const reserve = (kind = 'generate', extra = {}) => ent.reserveJob({ userId: U, jobKey: key(), kind, ...extra });

beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(T0); fakes.reset(); QueueJob.__reset(); });
afterEach(() => jest.useRealTimers());

describe('Free plan allowance', () => {
  it('allows exactly 1 website generation, then GENERATION_QUOTA_EXCEEDED with structured details', async () => {
    await reserve('generate');
    const e = await err(reserve('generate'));
    expect(e.code).toBe('GENERATION_QUOTA_EXCEEDED');
    expect(e.status).toBe(402);
    expect(e.details).toMatchObject({ currentPlan: { id: 'free' }, used: 1, limit: 1, remaining: 0, resetAt: '2026-11-30T18:30:00.000Z', isTopPlan: false });
    expect(e.details.upgradeOptions.map((o) => o.planId)).toEqual(['pro', 'plus']);
    expect(JSON.stringify(e.details)).not.toMatch(/razorpay|secret|token|stack/i);
  });
  it('allows 5 AI edits, then EDIT_QUOTA_EXCEEDED', async () => {
    for (let i = 0; i < 5; i += 1) await reserve('edit');
    expect(await code(reserve('edit'))).toBe('EDIT_QUOTA_EXCEEDED');
  });
  it('generation and edit allowances are independent', async () => {
    await reserve('generate');
    await expect(reserve('edit')).resolves.toBeTruthy();
  });
  it('the free allowance resets on the 1st of every month (IST), not before', async () => {
    const { ledger } = await reserve('generate');
    await ent.commitJob(ledger.jobKey);
    const e = await err(reserve('generate'));
    expect(e.code).toBe('GENERATION_QUOTA_EXCEEDED');
    expect(e.details.resetAt).toBe('2026-11-30T18:30:00.000Z'); // 1 Dec 00:00 IST
    jest.setSystemTime(new Date('2026-11-30T18:29:00Z')); // 23:59 IST on 30 Nov: still November
    expect(await code(reserve('generate'))).toBe('GENERATION_QUOTA_EXCEEDED');
    jest.setSystemTime(new Date('2026-11-30T18:31:00Z')); // 00:01 IST on 1 Dec
    await expect(reserve('generate')).resolves.toBeTruthy();
  });
  it('free edits reset on the 1st too', async () => {
    for (let i = 0; i < 5; i += 1) await reserve('edit');
    expect(await code(reserve('edit'))).toBe('EDIT_QUOTA_EXCEEDED');
    jest.setSystemTime(new Date('2026-12-01T00:00:00Z'));
    await expect(reserve('edit')).resolves.toBeTruthy();
  });
});

describe('Pro and Plus allowances', () => {
  it('Pro: 20 generations, the 21st is refused', async () => {
    seedSub({ planId: 'pro' });
    for (let i = 0; i < 20; i += 1) await reserve('generate');
    const e = await err(reserve('generate'));
    expect(e.code).toBe('GENERATION_QUOTA_EXCEEDED');
    expect(e.details).toMatchObject({ currentPlan: { id: 'pro' }, used: 20, limit: 20, resetAt: '2026-12-01T10:00:00.000Z' });
    expect(e.details.upgradeOptions.map((o) => o.planId)).toEqual(['plus']);
  });
  it('Plus: 50 generations; at quota there is nothing higher to upgrade to', async () => {
    seedSub({ planId: 'plus' });
    for (let i = 0; i < 50; i += 1) await reserve('generate');
    const e = await err(reserve('generate'));
    expect(e.code).toBe('GENERATION_QUOTA_EXCEEDED');
    expect(e.details).toMatchObject({ limit: 50, isTopPlan: true, upgradeOptions: [] });
    expect(e.details.resetAt).toBeTruthy();
  });
  it('paid plans have unlimited edits (they do not consume a counter)', async () => {
    seedSub({ planId: 'pro' });
    for (let i = 0; i < 30; i += 1) await reserve('edit');
    const counter = fakes.UsageCounter.__rows[0];
    expect(counter?.editsUsed || 0).toBe(0);
  });
  it('fair-use ceiling applies to "unlimited" edits and is reported, not silent', async () => {
    seedSub({ planId: 'pro' });
    const limit = 60;
    for (let i = 0; i < limit; i += 1) await reserve('edit');
    const e = await err(reserve('edit'));
    expect(e.code).toBe('FAIR_USE_LIMIT_REACHED');
    expect(e.details.fairUsePerHour).toBe(limit);
    jest.setSystemTime(new Date(T0.getTime() + 61 * 60 * 1000));
    await expect(reserve('edit')).resolves.toBeTruthy();
  });
});

describe('quota windows', () => {
  it('yearly subscriptions still reset monthly from the anchor; renewal date is a different date', async () => {
    seedSub({ planId: 'pro', interval: 'yearly', currentPeriodEnd: new Date('2027-11-01T10:00:00Z') });
    for (let i = 0; i < 20; i += 1) await reserve('generate');
    expect(await code(reserve('generate'))).toBe('GENERATION_QUOTA_EXCEEDED');
    jest.setSystemTime(new Date('2026-12-01T10:00:01Z'));
    await expect(reserve('generate')).resolves.toBeTruthy();
    const usage = await ent.getUsageSummary(U);
    expect(usage.nextQuotaReset).toBe('2027-01-01T10:00:00.000Z');
    expect(usage.renewalDate).toBe('2027-11-01T10:00:00.000Z');
    expect(usage.generations).toMatchObject({ used: 1, limit: 20, remaining: 19 });
  });
});

describe('subscription expiry', () => {
  it('an expired Pro subscription falls back to Free and, when Free is spent, reports SUBSCRIPTION_INACTIVE', async () => {
    seedSub({ planId: 'pro', currentPeriodEnd: new Date('2026-11-05T00:00:00Z') });
    await reserve('generate');
    jest.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    const e1 = await reserve('generate'); // lapsed -> Free allowance (1 generation, still unused)
    expect(e1.ledger.planId).toBe('free');
    const e2 = await err(reserve('generate'));
    expect(e2.code).toBe('SUBSCRIPTION_INACTIVE');
    expect(e2.details.lapsedPlanId).toBe('pro');
    expect(fakes.Subscription.__rows[0].status).toBe('expired');
  });
  it('is idempotent: re-resolving an expired subscription is stable', async () => {
    seedSub({ currentPeriodEnd: new Date('2026-10-01T00:00:00Z') });
    const a = await ent.resolveEntitlement(U); const b = await ent.resolveEntitlement(U);
    expect([a.status, b.status]).toEqual(['expired', 'expired']);
  });
  it('a cancelled (cancel-at-period-end) subscription keeps access until the end, then lapses', async () => {
    seedSub({ cancelAtPeriodEnd: true });
    expect((await ent.resolveEntitlement(U)).status).toBe('cancelling');
    jest.setSystemTime(new Date('2026-12-02T00:00:00Z'));
    const r = await ent.resolveEntitlement(U);
    expect(r.status).toBe('expired');
    expect(r.lapsed.reason).toBe('cancelled');
  });
  it('a configured grace period keeps entitlement after the term ends', async () => {
    process.env.BILLING_GRACE_DAYS = '3';
    try {
      seedSub({ currentPeriodEnd: new Date('2026-11-05T00:00:00Z') });
      jest.setSystemTime(new Date('2026-11-07T00:00:00Z'));
      expect((await ent.resolveEntitlement(U)).status).toBe('grace');
      jest.setSystemTime(new Date('2026-11-09T00:00:00Z'));
      expect((await ent.resolveEntitlement(U)).status).toBe('expired');
    } finally { delete process.env.BILLING_GRACE_DAYS; }
  });
});

describe('plan without generation access', () => {
  it('PLAN_UPGRADE_REQUIRED when the plan grants no generations', async () => {
    mockFreeQuota = 0;
    try {
      const e = await err(reserve('generate'));
      expect(e.code).toBe('PLAN_UPGRADE_REQUIRED');
      expect(e.status).toBe(403);
      expect(e.details.upgradeOptions.length).toBeGreaterThan(0);
    } finally { mockFreeQuota = undefined; }
  });
});

describe('concurrency, duplicates, retries', () => {
  it('30 parallel requests against a 20-generation plan: exactly 20 succeed', async () => {
    seedSub({ planId: 'pro' });
    const results = await Promise.all(Array.from({ length: 30 }, () => reserve('generate').then(() => 'ok', (e) => e.code)));
    expect(results.filter((r) => r === 'ok')).toHaveLength(20);
    expect(results.filter((r) => r === 'GENERATION_QUOTA_EXCEEDED')).toHaveLength(10);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(20);
    expect(fakes.GenerationLedger.__rows).toHaveLength(20);
  });
  it('parallel requests from a Free user: exactly 1 succeeds', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve('generate').then(() => 'ok', (e) => e.code)));
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
  });
  it('the same jobKey is idempotent: a duplicate dispatch never double-charges', async () => {
    seedSub({ planId: 'pro' });
    const jobKey = 'dup-1';
    const settled = await Promise.allSettled([1, 2, 3].map(() => ent.reserveJob({ userId: U, jobKey, kind: 'generate' })));
    expect(settled.filter((r) => r.status === 'fulfilled' && !r.value.duplicate)).toHaveLength(1);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1); // never charged twice
    expect(fakes.GenerationLedger.__rows).toHaveLength(1);
    const again = await ent.reserveJob({ userId: U, jobKey, kind: 'generate' }); // sequential retry of the same request
    expect(again.duplicate).toBe(true);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
  it('internal retries reuse the jobKey and consume nothing extra; completion commits once', async () => {
    const { ledger } = await reserve('generate');
    for (let attempt = 0; attempt < 3; attempt += 1) await ent.reserveJob({ userId: U, jobKey: ledger.jobKey, kind: 'generate' }); // BullMQ attempts / quota delays
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
    expect(await ent.commitJob(ledger.jobKey)).toBe(true);
    expect(await ent.commitJob(ledger.jobKey)).toBe(false);
    expect(await ent.releaseJob(ledger.jobKey, 'late')).toBe(false); // a committed job can never be refunded
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
  });
  it('a failed job is refunded exactly once, even if the failure event is delivered twice', async () => {
    const { ledger } = await reserve('generate');
    expect(await ent.releaseJob(ledger.jobKey, 'failed')).toBe(true);
    expect(await ent.releaseJob(ledger.jobKey, 'failed')).toBe(false);
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(0);
    await expect(reserve('generate')).resolves.toBeTruthy(); // the user can try again
  });
  it('debug retry re-takes the released unit: one unit per generation, and it respects the quota', async () => {
    const first = await reserve('generate');
    await ent.releaseJob(first.ledger.jobKey, 'failed');
    const retry = await ent.reserveDebugRetry({ userId: U, originalJobKey: first.ledger.jobKey, debugJobKey: 'debug-1' });
    expect(retry.ledger.jobKey).toBe('debug-1');
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(1);
    expect(fakes.GenerationLedger.__rows).toHaveLength(1);
    // user burns their allowance elsewhere while a failed job waits: retry is refused, not free
    const second = await reserve('generate').catch((e) => e);
    expect(second.code).toBe('GENERATION_QUOTA_EXCEEDED');
  });
  it('debug retry cannot bypass an exhausted quota', async () => {
    seedSub({ planId: 'pro' });
    const failed = await reserve('generate');
    await ent.releaseJob(failed.ledger.jobKey, 'failed');
    for (let i = 0; i < 20; i += 1) await reserve('generate');
    expect(await code(ent.reserveDebugRetry({ userId: U, originalJobKey: failed.ledger.jobKey, debugJobKey: 'd2' }))).toBe('GENERATION_QUOTA_EXCEEDED');
  });
  it('a lost reservation (job gone) is settled so users are not locked out', async () => {
    const { ledger } = await reserve('generate');
    jest.setSystemTime(new Date(T0.getTime() + 20 * 60 * 1000));
    await ent.reconcileUserReservations(U);
    expect(fakes.GenerationLedger.__rows.find((r) => r.jobKey === ledger.jobKey).status).toBe('released');
    expect(fakes.UsageCounter.__rows[0].generationsUsed).toBe(0);
  });
  it('only the owner can see a job key (another user reusing it is refused)', async () => {
    const { ledger } = await reserve('generate');
    expect(await code(ent.reserveJob({ userId: 'user-2', jobKey: ledger.jobKey, kind: 'generate' }))).toBe('PLAN_NOT_AVAILABLE');
  });
});

describe('server-side classification of edits (client claims are not trusted)', () => {
  it('an "edit" claim without a committed generation on that project is charged as a generation', async () => {
    expect(await ent.classifyRequest({ userId: U, projectId: 'p1', claimsEdit: true, project: { files: { 'a.js': 'x' } } })).toBe('generate');
    expect(await ent.classifyRequest({ userId: U, claimsEdit: true })).toBe('generate');
  });
  it('after a committed generation on the project, edits are edits', async () => {
    const { ledger } = await reserve('generate', { projectId: 'p1' });
    await ent.commitJob(ledger.jobKey);
    expect(await ent.classifyRequest({ userId: U, projectId: 'p1', claimsEdit: true })).toBe('edit');
    expect(await ent.classifyRequest({ userId: U, projectId: 'p2', claimsEdit: true })).toBe('generate');
    expect(await ent.classifyRequest({ userId: 'user-2', projectId: 'p1', claimsEdit: true })).toBe('generate');
  });
  it('pre-billing projects can be edit-eligible via an explicit cutoff', async () => {
    process.env.BILLING_LEGACY_PROJECTS_BEFORE = '2026-11-01T00:00:00Z';
    try {
      expect(await ent.classifyRequest({ userId: U, projectId: 'old', claimsEdit: true, project: { createdAt: new Date('2026-06-01'), files: { 'a.js': 'x' } } })).toBe('edit');
      expect(await ent.classifyRequest({ userId: U, projectId: 'new', claimsEdit: true, project: { createdAt: new Date('2026-11-02'), files: { 'a.js': 'x' } } })).toBe('generate');
    } finally { delete process.env.BILLING_LEGACY_PROJECTS_BEFORE; }
  });
});

describe('usage summary', () => {
  it('Pro 12/20 used, 8 remaining, edits unlimited', async () => {
    seedSub({ planId: 'pro' });
    for (let i = 0; i < 12; i += 1) await reserve('generate');
    const u = await ent.getUsageSummary(U);
    expect(u).toMatchObject({ plan: { id: 'pro' }, subscriptionStatus: 'active', billingInterval: 'monthly', generations: { used: 12, limit: 20, remaining: 8 }, edits: { unlimited: true } });
  });
  it('Free shows the monthly allowance and the 1st-of-month reset date', async () => {
    const u = await ent.getUsageSummary(U);
    expect(u).toMatchObject({ plan: { id: 'free' }, nextQuotaReset: '2026-11-30T18:30:00.000Z', renewalDate: null, quotaPeriod: 'monthly_calendar', generations: { used: 0, limit: 1, remaining: 1 }, edits: { unlimited: false, limit: 5, remaining: 5 } });
  });
});
