jest.mock('../../../../../src/modules/deployment/deployment.model', () => require('./_harness').modelDefs().Deployment());
jest.mock('../../../../../src/modules/deployment/deploymentVersion.model', () => require('./_harness').modelDefs().DeploymentVersion());
jest.mock('../../../../../src/services/deployment/providers/vercel.provider');
jest.mock('../../../../../src/services/deployment/vercelContext', () => ({
  isVercelSite: (s) => Boolean(s && s.frontendProvider === 'vercel' && s.vercel && s.vercel.projectId),
  loadVercelContext: jest.fn().mockResolvedValue({ credential: 'tok', metadata: {}, projectId: 'prj_1' }),
}));
const Deployment = require('../../../../../src/modules/deployment/deployment.model');
const Version = require('../../../../../src/modules/deployment/deploymentVersion.model');
const provider = require('../../../../../src/services/deployment/providers/vercel.provider');
const sync = require('../../../../../src/services/deployment/versionSync.service');
const { seedSite, vdep, stubNoTransactions } = require('./_harness');

let site;
beforeEach(async () => {
  Deployment.__reset(); Version.__reset(); stubNoTransactions();
  site = await seedSite(Deployment);
  provider.listDeploymentsPage.mockReset().mockResolvedValue({ deployments: [vdep('d4', 4000), vdep('d3', 3000, { environment: 'preview', target: null }), vdep('d2', 2000), vdep('d1', 1000)], next: null });
  provider.getProductionState.mockReset().mockResolvedValue({ currentDeploymentId: 'd4', autoAssignCustomDomains: true, lastAliasRequest: null });
  provider.getDeployment.mockReset();
});
afterEach(() => jest.restoreAllMocks());

const byLabel = () => Object.fromEntries(Version.__store.map((v) => [v.vercelDeploymentId, v]));

describe('versionSync.syncSite', () => {
  it('maps Vercel deployments to chronological version numbers (oldest = v1)', async () => {
    const r = await sync.syncSite(site, { force: true });
    expect(r).toMatchObject({ synced: true, created: 4 });
    const m = byLabel();
    expect([m.d1, m.d2, m.d3, m.d4].map((v) => v.versionNumber)).toEqual([1, 2, 3, 4]);
    expect(m.d3.environment).toBe('preview');
    expect(m.d2.environment).toBe('production');
    expect(m.d1.commitSha).toBe('sha-d1');
  });

  it('marks exactly the production deployment Vercel reports as current', async () => {
    await sync.syncSite(site, { force: true });
    const current = Version.__store.filter((v) => v.isCurrentProduction);
    expect(current.map((v) => v.vercelDeploymentId)).toEqual(['d4']);
  });

  it('keeps history and numbering stable when newer deployments arrive; handles external ones', async () => {
    await sync.syncSite(site, { force: true });
    provider.listDeploymentsPage.mockResolvedValue({ deployments: [vdep('d5', 5000), vdep('d4', 4000)], next: null });
    provider.getProductionState.mockResolvedValue({ currentDeploymentId: 'd5', autoAssignCustomDomains: true });
    const r = await sync.syncSite(site, { force: true });
    expect(r.created).toBe(1);
    const m = byLabel();
    expect(m.d5.versionNumber).toBe(5);
    expect(m.d5.origin).toBe('external');
    expect(m.d1.versionNumber).toBe(1);
    expect(Version.__store).toHaveLength(5);
    expect(Version.__store.filter((v) => v.isCurrentProduction).map((v) => v.vercelDeploymentId)).toEqual(['d5']);
  });

  it('is idempotent: repeated syncs create no duplicates', async () => {
    await sync.syncSite(site, { force: true });
    await sync.syncSite(site, { force: true });
    expect(Version.__store).toHaveLength(4);
  });

  it('ignores deployments that belong to another Vercel project', async () => {
    provider.listDeploymentsPage.mockResolvedValue({ deployments: [vdep('x1', 9000, { projectId: 'prj_OTHER' }), vdep('d1', 1000)], next: null });
    provider.getProductionState.mockResolvedValue({ currentDeploymentId: null });
    await sync.syncSite(site, { force: true });
    expect(Version.__store.map((v) => v.vercelDeploymentId)).toEqual(['d1']);
  });

  it('updates status of an existing version (BUILDING -> READY) without renumbering', async () => {
    provider.listDeploymentsPage.mockResolvedValue({ deployments: [vdep('d1', 1000, { state: 'BUILDING', readySubstate: null })], next: null });
    provider.getProductionState.mockResolvedValue({ currentDeploymentId: null });
    await sync.syncSite(site, { force: true });
    provider.listDeploymentsPage.mockResolvedValue({ deployments: [vdep('d1', 1000)], next: null });
    await sync.syncSite(site, { force: true });
    expect(Version.__store).toHaveLength(1);
    expect(Version.__store[0]).toMatchObject({ versionNumber: 1, state: 'READY' });
  });

  it('does not change the production pointer when Vercel cannot report it', async () => {
    await sync.syncSite(site, { force: true });
    provider.getProductionState.mockRejectedValue(new Error('vercel down'));
    await sync.syncSite(site, { force: true });
    expect(Version.__store.filter((v) => v.isCurrentProduction).map((v) => v.vercelDeploymentId)).toEqual(['d4']);
  });

  it('prevents two concurrent syncs from both assigning numbers (lease)', async () => {
    const [a, b] = await Promise.all([sync.syncSite(site, { force: true }), sync.syncSite(site, { force: true })]);
    expect([a.skipped, b.skipped].filter((s) => s === 'locked')).toHaveLength(1);
    const numbers = Version.__store.map((v) => v.versionNumber).sort();
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('skips non-Vercel sites and respects freshness', async () => {
    expect(await sync.syncSite({ ...site, frontendProvider: 'render' }, { force: true })).toMatchObject({ skipped: 'not_vercel' });
    await sync.syncSite(site, { force: true });
    const fresh = Deployment.__store[0];
    expect(await sync.syncSite(fresh)).toMatchObject({ skipped: 'fresh' });
  });

  it('never stores credentials on version records', async () => {
    await sync.syncSite(site, { force: true });
    expect(JSON.stringify(Version.__store)).not.toMatch(/tok|credential|token/i);
  });
});

describe('versionSync reads', () => {
  beforeEach(async () => {
    provider.listDeploymentsPage.mockResolvedValue({ deployments: [vdep('d5', 5000, { state: 'ERROR', readySubstate: null }), vdep('d4', 4000), vdep('d3', 3000, { environment: 'preview', target: null }), vdep('d2', 2000), vdep('d1', 1000)], next: null });
    await sync.syncSite(site, { force: true });
  });

  it('distinguishes latest, latest successful, current production and historical', async () => {
    const summary = await sync.getSummary(site._id);
    const { versions } = await sync.listVersions(site, { limit: 50 });
    const roles = Object.fromEntries(versions.map((v) => [v.versionNumber, sync.serializeVersion(v, summary).role]));
    expect(roles).toEqual({ 5: 'latest', 4: 'current-production', 3: 'historical', 2: 'historical', 1: 'historical' });
    const latestSuccessful = versions.map((v) => sync.serializeVersion(v, summary)).find((v) => v.isLatestSuccessful);
    expect(latestSuccessful.versionNumber).toBe(4);
  });

  it('paginates newest-first with a keyset cursor', async () => {
    const p1 = await sync.listVersions(site, { limit: 2 });
    expect(p1.versions.map((v) => v.versionNumber)).toEqual([5, 4]);
    const p2 = await sync.listVersions(site, { limit: 2, cursor: p1.nextCursor });
    expect(p2.versions.map((v) => v.versionNumber)).toEqual([3, 2]);
    const p3 = await sync.listVersions(site, { limit: 2, cursor: p2.nextCursor });
    expect(p3.versions.map((v) => v.versionNumber)).toEqual([1]);
    expect(p3.nextCursor).toBeNull();
  });

  it('is scoped to the owner', async () => {
    const { versions } = await sync.listVersions({ ...site, userId: 'someone-else' }, {});
    expect(versions).toHaveLength(0);
  });

  it('annotates rollback eligibility (preview/failed/current ineligible; older production eligible)', async () => {
    const summary = await sync.getSummary(site._id);
    const { versions } = await sync.listVersions(site, { limit: 50 });
    const e = Object.fromEntries(versions.map((v) => [v.versionNumber, sync.serializeVersion(v, summary).rollback]));
    expect(e[2]).toMatchObject({ eligible: true, kind: 'rollback' });
    expect(e[3].reason.code).toBe('PREVIEW_NOT_ELIGIBLE');
    expect(e[5].reason.code).toBe('NOT_READY');
    expect(e[4].reason.code).toBe('ALREADY_LIVE');
  });
});
