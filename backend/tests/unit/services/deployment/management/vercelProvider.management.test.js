const { Readable } = require('stream');
jest.mock('axios');
const axios = require('axios');
const provider = require('../../../../../src/services/deployment/providers/vercel.provider');

const mockApi = (impl) => { const api = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), ...impl }; axios.create = jest.fn(() => api); return api; };

describe('vercel.provider deployment management', () => {
  it('normalizes a deployment (environment, duration, commit)', () => {
    const n = provider.normalizeDeployment({ uid: 'dpl_1', url: 'a.vercel.app', readyState: 'READY', target: 'production', created: 1000, buildingAt: 2000, ready: 5000, meta: { githubCommitSha: 'abc1234def', githubCommitMessage: 'fix' } });
    expect(n).toMatchObject({ id: 'dpl_1', url: 'https://a.vercel.app', state: 'READY', environment: 'production', durationMs: 3000, commitSha: 'abc1234def' });
    expect(provider.normalizeDeployment({ uid: 'x', readyState: 'WEIRD', target: null }).environment).toBe('preview');
    expect(provider.normalizeDeployment({ uid: 'x', readyState: 'WEIRD' }).state).toBe('UNKNOWN');
  });

  it('extracts production state from the project', () => {
    const s = provider.extractProductionState({ id: 'prj', targets: { production: { id: 'dpl_9' } } });
    expect(s).toMatchObject({ currentDeploymentId: 'dpl_9' });
    expect(provider.extractProductionState({}).currentDeploymentId).toBeNull();
  });

  it('bounds build-log reads with a limit', async () => {
    const api = mockApi({ get: jest.fn().mockResolvedValue({ data: [{ text: 'a' }] }) });
    await provider.getBuildEvents('t', {}, 'dpl_1', { limit: 999999 });
    expect(api.get.mock.calls[0][1].params).toMatchObject({ builds: 1, direction: 'forward', limit: 5000 });
  });

  it('runtime log stream stops at the line cap instead of reading everything', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => JSON.stringify({ rowId: `r${i}`, message: `m${i}`, level: 'info', timestampInMs: i })).join('\n') + '\n';
    const stream = Readable.from([Buffer.from(lines)]);
    mockApi({ get: jest.fn().mockResolvedValue({ data: stream }) });
    const { entries, truncated } = await provider.readRuntimeLogs('t', {}, 'p', 'd', { maxLines: 10 });
    expect(entries).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it('runtime log stream ignores garbage lines', async () => {
    const stream = Readable.from([Buffer.from('not json\n{"rowId":"a","message":"ok","level":"info","timestampInMs":1}\n')]);
    mockApi({ get: jest.fn().mockResolvedValue({ data: stream }) });
    const { entries, truncated } = await provider.readRuntimeLogs('t', {}, 'p', 'd', {});
    expect(entries).toHaveLength(1);
    expect(truncated).toBe(false);
  });
});
