jest.mock('../../../../../src/services/deployment/providers/vercel.provider');
jest.mock('../../../../../src/services/deployment/vercelContext', () => ({ loadVercelContext: jest.fn().mockResolvedValue({ credential: 't', metadata: {}, projectId: 'prj_1' }) }));
const provider = require('../../../../../src/services/deployment/providers/vercel.provider');
const logs = require('../../../../../src/services/deployment/deploymentLogs.service');

const version = (o = {}) => ({ _id: 'v1', userId: 'u1', vercelDeploymentId: 'dpl_1', state: 'READY', availability: 'available', ...o });
const site = { _id: 's1', userId: 'u1' };
const buildEvents = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, type: i % 10 === 0 ? 'stderr' : 'stdout', created: 1000 + i, text: i === 3 ? 'DATABASE_URL=postgres://a:secretpw@h/db' : i % 10 === 0 ? `Error: step ${i} failed` : `line ${i}` }));

beforeEach(() => {
  logs.clearSnapshotsForTests();
  provider.getBuildEvents.mockReset().mockResolvedValue(buildEvents(25));
  provider.readRuntimeLogs.mockReset().mockResolvedValue({ entries: [
    { rowId: 'a', message: 'GET ok', level: 'info', timestampInMs: 5000, requestPath: '/', requestMethod: 'GET', responseStatusCode: 200 },
    { rowId: 'b', message: 'boom token=abc123zzz', level: 'error', timestampInMs: 6000, source: 'serverless' },
    { rowId: 'c', message: 'slow', level: 'warning', timestampInMs: 7000 },
  ], truncated: false });
});

describe('getLogs', () => {
  it('keeps build and runtime logs separate', async () => {
    const b = await logs.getLogs(site, version(), { type: 'build' });
    const r = await logs.getLogs(site, version(), { type: 'runtime' });
    expect(b.entries.every((e) => e.source === 'build')).toBe(true);
    expect(r.entries.every((e) => e.source === 'runtime')).toBe(true);
    expect(provider.getBuildEvents).toHaveBeenCalledTimes(1);
    expect(provider.readRuntimeLogs).toHaveBeenCalledTimes(1);
    expect(b.note).toMatch(/not included/i);
  });

  it('redacts secrets before they are returned', async () => {
    const b = await logs.getLogs(site, version(), { type: 'build', limit: 100 });
    const r = await logs.getLogs(site, version(), { type: 'runtime' });
    expect(JSON.stringify(b)).not.toContain('secretpw');
    expect(JSON.stringify(r)).not.toContain('abc123zzz');
  });

  it('bounds upstream reads', async () => {
    await logs.getLogs(site, version(), { type: 'build' });
    expect(provider.getBuildEvents.mock.calls[0][3].limit).toBe(logs.config().maxEvents);
    await logs.getLogs(site, version(), { type: 'runtime' });
    const opts = provider.readRuntimeLogs.mock.calls[0][4];
    expect(opts).toMatchObject({ maxLines: logs.config().maxEvents, maxBytes: expect.any(Number), timeoutMs: expect.any(Number) });
  });

  it('paginates with a cursor and never repeats entries', async () => {
    const p1 = await logs.getLogs(site, version(), { type: 'build', limit: 10 });
    expect(p1.entries).toHaveLength(10);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await logs.getLogs(site, version(), { type: 'build', limit: 10, cursor: p1.nextCursor });
    const p3 = await logs.getLogs(site, version(), { type: 'build', limit: 10, cursor: p2.nextCursor });
    expect(p3.nextCursor).toBeNull();
    const ids = [...p1.entries, ...p2.entries, ...p3.entries].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(25);
    expect(provider.getBuildEvents).toHaveBeenCalledTimes(1); // paging served from the bounded snapshot
  });

  it('rejects a cursor from an expired snapshot instead of returning wrong data', async () => {
    const p1 = await logs.getLogs(site, version(), { type: 'build', limit: 10 });
    logs.clearSnapshotsForTests();
    await new Promise((r) => setTimeout(r, 5));
    await expect(logs.getLogs(site, version(), { type: 'build', limit: 10, cursor: p1.nextCursor })).rejects.toMatchObject({ code: 'CURSOR_EXPIRED', status: 409 });
  });

  it('filters by severity, search text and time range', async () => {
    const errs = await logs.getLogs(site, version(), { type: 'build', severity: 'error', limit: 100 });
    expect(errs.entries.length).toBeGreaterThan(0);
    expect(errs.entries.every((e) => e.level === 'error')).toBe(true);

    const search = await logs.getLogs(site, version(), { type: 'build', q: 'LINE 7', limit: 100 });
    expect(search.entries.map((e) => e.message)).toEqual(['line 7']);

    const ranged = await logs.getLogs(site, version(), { type: 'build', since: 1005, until: 1009, limit: 100 });
    expect(ranged.entries.every((e) => e.ts >= 1005 && e.ts <= 1009)).toBe(true);
    expect(ranged.entries).toHaveLength(5);
  });

  it('search cannot be used to probe redacted secret values', async () => {
    const r = await logs.getLogs(site, version(), { type: 'build', q: 'secretpw', limit: 100 });
    expect(r.entries).toHaveLength(0);
  });

  it('validates input', async () => {
    await expect(logs.getLogs(site, version(), { type: 'nope' })).rejects.toMatchObject({ code: 'INVALID_LOG_TYPE' });
    await expect(logs.getLogs(site, version(), { type: 'build', severity: 'loud' })).rejects.toMatchObject({ code: 'INVALID_SEVERITY' });
    await expect(logs.getLogs(site, version(), { type: 'build', since: 10, until: 5 })).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
    await expect(logs.getLogs(site, version(), { type: 'build', cursor: '!!!' })).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it('error view merges build + runtime errors and the deployment error summary', async () => {
    const r = await logs.getLogs(site, version({ state: 'READY', errorMessage: 'Build failed', errorCode: 'BUILD_FAILED' }), { type: 'error', limit: 100 });
    expect(r.entries.every((e) => e.level === 'error')).toBe(true);
    const sources = new Set(r.entries.map((e) => e.source));
    expect(sources).toEqual(new Set(['build', 'runtime', 'deployment']));
  });

  it('reports runtime logs unavailable for a failed build without calling Vercel for them', async () => {
    const r = await logs.getLogs(site, version({ state: 'ERROR' }), { type: 'runtime' });
    expect(r.entries).toEqual([]);
    expect(r.sources.runtime.status).toBe('unavailable');
    expect(provider.readRuntimeLogs).not.toHaveBeenCalled();
  });

  it('turns expired / restricted logs into explicit empty states, not errors', async () => {
    provider.getBuildEvents.mockRejectedValueOnce(Object.assign(new Error('x'), { vercel: { code: 'GONE', message: 'gone', httpStatus: 410 } }));
    const gone = await logs.getLogs(site, version(), { type: 'build' });
    expect(gone.sources.build.status).toBe('expired');
    logs.clearSnapshotsForTests();
    provider.readRuntimeLogs.mockRejectedValueOnce(Object.assign(new Error('x'), { vercel: { code: 'PLAN_RESTRICTION', message: 'p', httpStatus: 402 } }));
    const restricted = await logs.getLogs(site, version(), { type: 'runtime' });
    expect(restricted.sources.runtime.status).toBe('restricted');
  });

  it('surfaces rate limiting and outages as errors', async () => {
    provider.getBuildEvents.mockRejectedValueOnce(Object.assign(new Error('x'), { vercel: { code: 'RATE_LIMITED', message: 'slow', httpStatus: 429, retryable: true } }));
    await expect(logs.getLogs(site, version(), { type: 'build' })).rejects.toMatchObject({ status: 429 });
  });

  it('throttles forced refreshes so they cannot hammer Vercel', async () => {
    await logs.getLogs(site, version(), { type: 'build' });
    const again = await logs.getLogs(site, version(), { type: 'build', refresh: true });
    expect(again.throttled).toBe(true);
    expect(provider.getBuildEvents).toHaveBeenCalledTimes(1);
  });

  it('scopes cached snapshots per user/version', async () => {
    await logs.getLogs(site, version(), { type: 'build' });
    await logs.getLogs({ _id: 's2', userId: 'u2' }, version({ _id: 'v2', userId: 'u2' }), { type: 'build' });
    expect(provider.getBuildEvents).toHaveBeenCalledTimes(2);
  });
});
