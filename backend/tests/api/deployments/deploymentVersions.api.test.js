process.env.DEPLOYMENT_LOGS_RATE_LIMIT_MAX_REQUESTS = '4';

jest.mock('../../../src/shared/middleware/auth', () => ({ auth: (req, res, next) => { if (!req.header('x-test-user')) return res.status(401).json({ success: false, code: 'AUTH_TOKEN_MISSING' }); req.userId = req.header('x-test-user'); req.user = { _id: req.userId, isVerified: req.header('x-unverified') !== '1' }; next(); } }));
jest.mock('../../../src/shared/middleware/verifyEmail', () => (req, res, next) => (req.user.isVerified ? next() : res.status(403).json({ success: false, requiresVerification: true })));
jest.mock('../../../src/modules/deployment/deployment.controller', () => new Proxy({}, { get: () => (req, res) => res.json({}) }));
jest.mock('../../../src/modules/deployment/deployment.model', () => require('../../unit/services/deployment/management/_harness').modelDefs().Deployment());
jest.mock('../../../src/modules/deployment/deploymentVersion.model', () => require('../../unit/services/deployment/management/_harness').modelDefs().DeploymentVersion());
jest.mock('../../../src/services/deployment/providers/vercel.provider');
jest.mock('../../../src/services/deployment/vercelContext', () => ({
  isVercelSite: (s) => Boolean(s && s.frontendProvider === 'vercel' && s.vercel && s.vercel.projectId),
  loadVercelContext: jest.fn().mockResolvedValue({ credential: 'tok', metadata: {}, projectId: 'prj_1' }),
}));

const express = require('express');
const request = require('supertest');
const Deployment = require('../../../src/modules/deployment/deployment.model');
const Version = require('../../../src/modules/deployment/deploymentVersion.model');
const provider = require('../../../src/services/deployment/providers/vercel.provider');
const { seedSite, vdep, stubNoTransactions } = require('../../unit/services/deployment/management/_harness');

let app; let siteA; let siteB; let v2;
let n = 0; let U = 'user1'; // fresh user per test: limiter state is module-level
const hdr = (u) => ({ 'x-test-user': u || U });

beforeEach(async () => {
  n += 1; U = `user${n}`;
  Deployment.__reset(); Version.__reset(); stubNoTransactions();
  siteA = await seedSite(Deployment, { userId: U });
  siteB = await seedSite(Deployment, { userId: `${U}b`, vercel: { projectId: 'prj_2' } });
  for (const [dep, n, o] of [['d1', 1, {}], ['d2', 2, {}], ['d3', 3, { isCurrentProduction: true }]]) {
    await Version.create({ deploymentRef: siteA._id, userId: U, vercelProjectId: 'prj_1', vercelDeploymentId: dep, versionNumber: n, environment: 'production', state: 'READY', readySubstate: 'PROMOTED', vercelCreatedAt: new Date(n * 1000), ...o });
  }
  v2 = Version.__store.find((v) => v.vercelDeploymentId === 'd2');
  provider.listDeploymentsPage.mockReset().mockResolvedValue({ deployments: [vdep('d3', 3000), vdep('d2', 2000), vdep('d1', 1000)], next: null });
  provider.getProductionState.mockReset().mockResolvedValue({ currentDeploymentId: 'd3' });
  provider.getDeployment.mockReset().mockImplementation(async (_c, _m, id) => vdep(id, 1000));
  provider.getBuildEvents.mockReset().mockResolvedValue([{ id: 'e1', type: 'stdout', created: 1, text: 'hello' }]);
  provider.readRuntimeLogs.mockReset().mockResolvedValue({ entries: [], truncated: false });
});
afterEach(() => jest.restoreAllMocks());

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/deployments', require('../../../src/modules/deployment/deployment.routes'));
  return a;
};
beforeAll(() => { app = buildApp(); });

describe('authentication & ownership', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions`)).status).toBe(401);
  });

  it('lists the owner\'s version history', async () => {
    const res = await request(app).get(`/api/deployments/${siteA._id}/versions`).set(hdr());
    expect(res.status).toBe(200);
    expect(res.body.data.versions.map((v) => v.label)).toEqual(['v3', 'v2', 'v1']);
    expect(res.body.data.summary.currentProductionVersionNumber).toBe(3);
  });
});

describe('validation', () => {
  it('rejects malformed ids', async () => {
    expect((await request(app).get('/api/deployments/not-an-id/versions').set(hdr())).status).toBe(400);
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions/zzz`).set(hdr())).status).toBe(400);
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions?limit=9999`).set(hdr())).status).toBe(400);
  });

  it('no longer exposes any rollback endpoint', async () => {
    const res = await request(app).post(`/api/deployments/${siteA._id}/rollback`).set(hdr()).send({ versionId: String(v2._id), confirm: true });
    expect(res.status).toBe(404);
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/rollback-check`).set(hdr())).status).toBe(404);
  });
});

describe('cross-user / cross-site protection', () => {
  it('another user cannot read someone else\'s history', async () => {
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions`).set(hdr(`${U}b`))).status).toBe(404);
    expect((await request(app).post(`/api/deployments/${siteA._id}/versions/sync`).set(hdr(`${U}b`))).status).toBe(404);
  });

  it('cannot use a version id from a different site (even your own other site)', async () => {
    const res = await request(app).get(`/api/deployments/${siteB._id}/versions/${v2._id}`).set(hdr(`${U}b`));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('VERSION_NOT_FOUND');
  });

  it('cannot read logs of another user\'s version', async () => {
    const res = await request(app).get(`/api/deployments/${siteB._id}/versions/${v2._id}/logs/build`).set(hdr(`${U}b`));
    expect(res.status).toBe(404);
    expect(provider.getBuildEvents).not.toHaveBeenCalled();
  });
});

describe('logs endpoint', () => {
  it('serves build logs with filters and never leaks secrets', async () => {
    provider.getBuildEvents.mockResolvedValue([{ id: 'e1', type: 'stdout', created: 1, text: 'API_KEY=supersecretvalue' }, { id: 'e2', type: 'stdout', created: 2, text: 'ok done' }]);
    const res = await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/logs/build?q=ok`).set(hdr());
    expect(res.status).toBe(200);
    expect(res.body.data.entries.map((e) => e.message)).toEqual(['ok done']);
    const all = await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/logs?type=build`).set(hdr());
    expect(JSON.stringify(all.body)).not.toContain('supersecretvalue');
    expect(all.headers['cache-control']).toBe('no-store');
  });

  it('validates query params', async () => {
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/logs?type=browser`).set(hdr())).status).toBe(400);
    expect((await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/logs?limit=100000`).set(hdr())).status).toBe(400);
  });

  it('is rate limited per user', async () => {
    const codes = [];
    for (let i = 0; i < 6; i += 1) codes.push((await request(app).get(`/api/deployments/${siteA._id}/versions/${v2._id}/logs?type=build&limit=5`).set(hdr())).status);
    expect(codes).toContain(429);
  });
});
