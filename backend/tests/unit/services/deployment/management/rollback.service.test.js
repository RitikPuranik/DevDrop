jest.mock('../../../../../src/modules/deployment/deployment.model', () => require('./_harness').modelDefs().Deployment());
jest.mock('../../../../../src/modules/deployment/deploymentVersion.model', () => require('./_harness').modelDefs().DeploymentVersion());
jest.mock('../../../../../src/modules/deployment/rollbackOperation.model', () => require('./_harness').modelDefs().RollbackOperation());
jest.mock('../../../../../src/services/deployment/providers/vercel.provider');
jest.mock('../../../../../src/infrastructure/jobs', () => ({ enqueueRollbackVerification: jest.fn().mockResolvedValue({}) }));
jest.mock('../../../../../src/services/deployment/vercelContext', () => ({
  isVercelSite: (s) => Boolean(s && s.frontendProvider === 'vercel' && s.vercel && s.vercel.projectId),
  loadVercelContext: jest.fn().mockResolvedValue({ credential: 'tok', metadata: {}, projectId: 'prj_1' }),
}));
const Deployment = require('../../../../../src/modules/deployment/deployment.model');
const Version = require('../../../../../src/modules/deployment/deploymentVersion.model');
const Op = require('../../../../../src/modules/deployment/rollbackOperation.model');
const provider = require('../../../../../src/services/deployment/providers/vercel.provider');
const jobs = require('../../../../../src/infrastructure/jobs');
const svc = require('../../../../../src/services/deployment/rollback.service');
const { seedSite, vdep, stubNoTransactions } = require('./_harness');

let site;
const seedVersions = async () => {
  const rows = [
    ['d1', 1, {}], ['d2', 2, {}], ['d3', 3, { environment: 'preview' }], ['d4', 4, { isCurrentProduction: true }], ['d5', 5, { state: 'ERROR' }],
  ];
  for (const [id, n, o] of rows) {
    await Version.create({ deploymentRef: site._id, userId: 'u1', vercelProjectId: 'prj_1', vercelDeploymentId: id, versionNumber: n, environment: 'production', state: 'READY', readySubstate: 'PROMOTED', vercelCreatedAt: new Date(n * 1000), ...o });
  }
};
const vid = (dep) => Version.__store.find((v) => v.vercelDeploymentId === dep)._id;
const current = () => Version.__store.filter((v) => v.isCurrentProduction).map((v) => v.vercelDeploymentId);
const start = (dep, extra = {}) => svc.startOperation({ site, versionId: vid(dep), ...extra });

const liveState = (id, o = {}) => ({ currentDeploymentId: id, autoAssignCustomDomains: true, lastAliasRequest: null, ...o });

beforeEach(async () => {
  Deployment.__reset(); Version.__reset(); Op.__reset(); stubNoTransactions();
  site = await seedSite(Deployment);
  await seedVersions();
  provider.getProductionState.mockReset().mockResolvedValue(liveState('d4'));
  provider.getDeployment.mockReset().mockImplementation(async (_c, _m, id) => vdep(id, 1000, id === 'd3' ? { environment: 'preview', target: null } : id === 'd5' ? { state: 'ERROR' } : {}));
  provider.requestRollback.mockReset().mockResolvedValue({ accepted: true });
  provider.requestPromote.mockReset().mockResolvedValue({ accepted: true });
  provider.getPromoteAliases.mockReset().mockResolvedValue([]);
  jobs.enqueueRollbackVerification.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('rollback to an exact historical deployment', () => {
  it('restores v2 (not "one step back") using that exact Vercel deployment id', async () => {
    const { operation } = await start('d2');
    expect(provider.requestRollback).toHaveBeenCalledTimes(1);
    expect(provider.requestRollback.mock.calls[0].slice(2, 4)).toEqual(['prj_1', 'd2']); // not d3 / d4
    expect(operation).toMatchObject({ kind: 'rollback', targetVersionNumber: 2, previousVersionNumber: 4, status: 'verifying' });
    expect(provider.requestPromote).not.toHaveBeenCalled(); // never rebuilds/redeploys
  });

  it('does NOT mark the deployment active just because Vercel accepted the request', async () => {
    await start('d2');
    expect(current()).toEqual(['d4']);
  });

  it('marks it active only after Vercel reports it serving production', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState('d2', { autoAssignCustomDomains: false, lastAliasRequest: { toDeploymentId: 'd2', jobStatus: 'succeeded' } }));
    const done = await svc.verifyOperation(operation._id, { force: true });
    expect(done).toMatchObject({ status: 'succeeded', active: false, autoAssignAffected: true });
    expect(current()).toEqual(['d2']);
    expect(Deployment.__store[0].versioning.autoAssignCustomDomains).toBe(false);
  });

  it('keeps waiting while Vercel is still switching aliases', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState('d2', { lastAliasRequest: { toDeploymentId: 'd2', jobStatus: 'pending' } }));
    const op = await svc.verifyOperation(operation._id, { force: true });
    expect(op.status).toBe('verifying');
    expect(current()).toEqual(['d4']);
  });

  it('times out honestly (verification_timeout) without changing history', async () => {
    const { operation } = await start('d2');
    Op.__store[0].verifyDeadline = new Date(Date.now() - 1000);
    const op = await svc.verifyOperation(operation._id, { force: true });
    expect(op).toMatchObject({ status: 'verification_timeout', active: false });
    expect(current()).toEqual(['d4']);
    expect(svc.serializeOperation(op).retry).toEqual({ safe: true, mode: 'verify' });
  });

  it('fails when Vercel cannot point the domains at the deployment, history untouched', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState('d4', { lastAliasRequest: { toDeploymentId: 'd2', jobStatus: 'failed' } }));
    provider.getPromoteAliases.mockResolvedValue([{ alias: 'example.com', status: 'failed' }]);
    const op = await svc.verifyOperation(operation._id, { force: true });
    expect(op).toMatchObject({ status: 'failed', error: { code: 'ALIAS_ASSIGNMENT_FAILED' } });
    expect(op.error.message).toContain('example.com');
    expect(current()).toEqual(['d4']);
  });

  it('uses promote (no rebuild) for a staged production deployment', async () => {
    Version.__store.find((v) => v.vercelDeploymentId === 'd2').readySubstate = 'STAGED';
    provider.getDeployment.mockImplementation(async (_c, _m, id) => vdep(id, 1000, { readySubstate: 'STAGED' }));
    const { operation } = await start('d2');
    expect(operation.kind).toBe('promote');
    expect(provider.requestPromote.mock.calls[0].slice(2, 4)).toEqual(['prj_1', 'd2']);
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('schedules a background verification job', async () => {
    await start('d2');
    expect(jobs.enqueueRollbackVerification).toHaveBeenCalledTimes(1);
  });

  it('runVerificationLoop drives the operation to a confirmed outcome', async () => {
    const { operation } = await start('d2');
    let calls = 0;
    provider.getProductionState.mockImplementation(async () => (++calls < 3 ? liveState('d4') : liveState('d2')));
    const done = await svc.runVerificationLoop(operation._id, { sleepFn: async () => { Op.__store[0].lastCheckedAt = null; } });
    expect(done.status).toBe('succeeded');
    expect(current()).toEqual(['d2']);
  });
});

describe('authorization / validation', () => {
  it('rejects an unknown or invalid version id', async () => {
    await expect(svc.startOperation({ site, versionId: 'nope' })).rejects.toMatchObject({ status: 404, code: 'VERSION_NOT_FOUND' });
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('rejects a version that belongs to another site or another user', async () => {
    const other = await Version.create({ deploymentRef: 'other-site', userId: 'u1', vercelProjectId: 'prj_1', vercelDeploymentId: 'dx', versionNumber: 1, environment: 'production', state: 'READY', vercelCreatedAt: new Date() });
    await expect(svc.startOperation({ site, versionId: other._id })).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
    const foreign = await Version.create({ deploymentRef: site._id, userId: 'intruder', vercelProjectId: 'prj_1', vercelDeploymentId: 'dy', versionNumber: 9, environment: 'production', state: 'READY', vercelCreatedAt: new Date() });
    await expect(svc.startOperation({ site, versionId: foreign._id })).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('rejects a version whose stored project differs from the site\'s project', async () => {
    Version.__store.find((v) => v.vercelDeploymentId === 'd2').vercelProjectId = 'prj_OTHER';
    await expect(start('d2')).rejects.toMatchObject({ code: 'PROJECT_MISMATCH' });
  });

  it('rejects when Vercel says the deployment belongs to a different project', async () => {
    provider.getDeployment.mockResolvedValue(vdep('d2', 1000, { projectId: 'prj_OTHER' }));
    await expect(start('d2')).rejects.toMatchObject({ status: 422, code: 'PROJECT_MISMATCH' });
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('rejects non-Vercel sites and sites with a deploy running', async () => {
    await expect(svc.startOperation({ site: { ...site, frontendProvider: 'render' }, versionId: vid('d2') })).rejects.toMatchObject({ code: 'NOT_A_VERCEL_SITE' });
    await expect(svc.startOperation({ site: { ...site, status: 'DEPLOYING_FRONTEND' }, versionId: vid('d2') })).rejects.toMatchObject({ code: 'DEPLOY_IN_PROGRESS' });
  });

  it.each([
    ['d3', 'PREVIEW_NOT_ELIGIBLE'],
    ['d5', 'NOT_READY'],
    ['d4', 'ALREADY_LIVE'],
  ])('refuses ineligible deployment %s (%s) without calling Vercel to roll back', async (dep, code) => {
    await expect(start(dep)).rejects.toMatchObject({ status: 422, code });
    expect(provider.requestRollback).not.toHaveBeenCalled();
    expect(Op.__store).toHaveLength(0);
  });

  it('flags an expired/deleted deployment as unavailable', async () => {
    provider.getDeployment.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'NOT_FOUND', message: 'nf', httpStatus: 404 } }));
    await expect(start('d2')).rejects.toMatchObject({ status: 409, code: 'DEPLOYMENT_UNAVAILABLE' });
    expect(Version.__store.find((v) => v.vercelDeploymentId === 'd2').availability).toBe('unavailable');
  });

  it('turns a Vercel 403 on the project into a permission error', async () => {
    provider.getProductionState.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'PERMISSION_DENIED', message: 'denied', httpStatus: 403 } }));
    await expect(start('d2')).rejects.toMatchObject({ status: 403, code: 'VERCEL_PERMISSION_DENIED' });
  });
});

describe('concurrency and idempotency', () => {
  it('allows only one of two simultaneous rollbacks (even to different targets)', async () => {
    const results = await Promise.allSettled([start('d1'), start('d2')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected.reason).toMatchObject({ status: 409, code: 'OPERATION_IN_PROGRESS' });
    expect(provider.requestRollback).toHaveBeenCalledTimes(1);
    expect(Op.__store.filter((o) => o.active)).toHaveLength(1);
  });

  it('rejects a new rollback while one is active', async () => {
    await start('d2');
    await expect(start('d1')).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
  });

  it('treats a repeated request with the same idempotency key as the same operation', async () => {
    const a = await start('d2', { idempotencyKey: 'key-123456789' });
    const b = await start('d2', { idempotencyKey: 'key-123456789' });
    expect(b.idempotent).toBe(true);
    expect(String(b.operation._id)).toBe(String(a.operation._id));
    expect(provider.requestRollback).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after a terminal outcome so a later rollback can run', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState('d2'));
    await svc.verifyOperation(operation._id, { force: true });
    provider.getProductionState.mockResolvedValue(liveState('d2'));
    const next = await start('d1');
    expect(next.operation.targetVersionNumber).toBe(1);
  });

  it('throttles concurrent status polls to one Vercel read', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockClear();
    await Promise.all([svc.verifyOperation(operation._id), svc.verifyOperation(operation._id), svc.verifyOperation(operation._id)]);
    expect(provider.getProductionState).toHaveBeenCalledTimes(1);
  });

  it('only one finaliser wins when two verifiers see success at once', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState('d2'));
    const [a, b] = await Promise.all([svc.verifyOperation(operation._id, { force: true }), svc.verifyOperation(operation._id, { force: true })]);
    expect([a.status, b.status]).toEqual(['succeeded', 'succeeded']);
    expect(current()).toEqual(['d2']);
    expect(Op.__store[0].events.filter((e) => e.type === 'confirmed')).toHaveLength(1);
  });
});

describe('failure handling', () => {
  it('records a plan restriction as a clear failure, releases the lock, leaves history intact', async () => {
    provider.requestRollback.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'PLAN_RESTRICTION', message: 'Hobby limit', httpStatus: 402, retryable: false } }));
    const { operation } = await start('d1');
    expect(operation).toMatchObject({ status: 'failed', active: false, error: { code: 'PLAN_RESTRICTION' } });
    expect(current()).toEqual(['d4']);
    provider.requestRollback.mockResolvedValue({ accepted: true });
    expect((await start('d2')).operation.status).toBe('verifying'); // lock was released
  });

  it('does NOT re-send after a timeout: it verifies the real production state instead', async () => {
    provider.requestRollback.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'TIMEOUT', message: 'timeout', outcomeUnknown: true, retryable: true } }));
    const { operation } = await start('d2');
    expect(operation).toMatchObject({ status: 'verifying', outcomeUnknown: true });
    provider.getProductionState.mockResolvedValue(liveState('d2')); // Vercel actually applied it
    const done = await svc.verifyOperation(operation._id, { force: true });
    expect(done.status).toBe('succeeded');
    expect(provider.requestRollback).toHaveBeenCalledTimes(1);
  });

  it('after an unknown outcome that never reached Vercel, fails as safely retryable', async () => {
    provider.requestRollback.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'NETWORK', message: 'net', outcomeUnknown: true, retryable: true } }));
    const { operation } = await start('d2');
    Op.__store[0].verifyDeadline = new Date(Date.now() - 1);
    const done = await svc.verifyOperation(operation._id, { force: true });
    expect(done).toMatchObject({ status: 'failed', error: { code: 'REQUEST_NOT_ACCEPTED', retryable: true } });
    expect(current()).toEqual(['d4']);
  });

  it('reports "unverified" when Vercel never says what serves production', async () => {
    const { operation } = await start('d2');
    provider.getProductionState.mockResolvedValue(liveState(null));
    Op.__store[0].verifyDeadline = new Date(Date.now() - 1);
    expect((await svc.verifyOperation(operation._id, { force: true })).status).toBe('unverified');
    expect(current()).toEqual(['d4']);
  });

  it('recovers an operation stranded in "requesting" by reconciling, not re-sending', async () => {
    const { operation } = await start('d2');
    const raw = Op.__store[0];
    raw.status = 'requesting'; raw.acceptedAt = null; raw.updatedAt = new Date(Date.now() - 10 * 60 * 1000);
    provider.requestRollback.mockClear();
    provider.getProductionState.mockResolvedValue(liveState('d2'));
    const done = await svc.verifyOperation(operation._id, { force: true });
    expect(done.status).toBe('succeeded');
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('a request that was never sent (crash before sending) fails retryable, nothing changed', async () => {
    const op = await Op.create({ deploymentRef: site._id, userId: 'u1', vercelProjectId: 'prj_1', kind: 'rollback', targetVersionId: vid('d2'), targetVersionNumber: 2, targetVercelDeploymentId: 'd2', status: 'pending', requestedAt: new Date(Date.now() - 10 * 60 * 1000) });
    const done = await svc.verifyOperation(op._id, { force: true });
    expect(done).toMatchObject({ status: 'failed', error: { code: 'REQUEST_NOT_SENT', retryable: true } });
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });
});

describe('retry', () => {
  it('after a timeout, retry only re-verifies (no second rollback request)', async () => {
    const { operation } = await start('d2');
    Op.__store[0].verifyDeadline = new Date(Date.now() - 1);
    await svc.verifyOperation(operation._id, { force: true });
    provider.requestRollback.mockClear();
    const retried = await svc.retryOperation({ site, operationId: operation._id });
    expect(retried.operation).toMatchObject({ status: 'verifying', retryOf: operation._id });
    expect(provider.requestRollback).not.toHaveBeenCalled();
  });

  it('refuses to retry non-retryable or still-active operations', async () => {
    provider.requestRollback.mockRejectedValue(Object.assign(new Error('x'), { vercel: { code: 'PLAN_RESTRICTION', message: 'm', retryable: false } }));
    const { operation } = await start('d1');
    await expect(svc.retryOperation({ site, operationId: operation._id })).rejects.toMatchObject({ code: 'NOT_RETRYABLE' });
  });

  it('scopes operation lookups to the owner', async () => {
    const { operation } = await start('d2');
    await expect(svc.getOperation({ ...site, userId: 'other' }, operation._id)).rejects.toMatchObject({ code: 'OPERATION_NOT_FOUND' });
  });
});

describe('check + warnings', () => {
  it('tells users rollback does not revert git, migrations, or backend, and warns about auto-assignment', async () => {
    const check = await svc.getRollbackCheck(site, vid('d2'));
    const text = check.warnings.join(' ');
    expect(check.eligible).toBe(true);
    expect(text).toMatch(/Git commits/);
    expect(text).toMatch(/database migrations/);
    expect(text).toMatch(/automatic assignment of production domains/i);
    expect(check.currentProduction.label).toBe('v4');
  });

  it('is not eligible while another operation is active', async () => {
    await start('d2');
    const check = await svc.getRollbackCheck(site, vid('d1'));
    expect(check.eligible).toBe(false);
    expect(check.reason.code).toBe('OPERATION_IN_PROGRESS');
  });

  it('never persists credentials in operation records', async () => {
    await start('d2');
    expect(JSON.stringify(Op.__store)).not.toMatch(/tok"|credential|Bearer/);
  });
});
