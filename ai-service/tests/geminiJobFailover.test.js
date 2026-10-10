/**
 * End-to-end-ish tests through callGemini() and the in-memory job queue with
 * a mocked HTTP layer. No network, no Mongo, no real Gemini quota.
 */
jest.mock('axios');
jest.mock('../src/orchestrator/websiteGeneration.orchestrator', () => ({ generateWebsite: jest.fn(), debugWebsite: jest.fn() }));
jest.mock('../src/orchestrator/websiteEditing.orchestrator', () => ({ editWebsite: jest.fn() }));

const OK_BODY = { data: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } } };

function rateLimit(retryDelay) {
  const err = new Error('Request failed with status code 429');
  err.response = {
    status: 429,
    data: { error: { message: 'Resource has been exhausted', details: retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : [] } },
  };
  return err;
}
const keyOf = (url) => new URL(url).searchParams.get('key');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(predicate, timeoutMs = 4000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await sleep(10);
  }
}

function load(env = {}) {
  jest.resetModules();
  Object.assign(process.env, {
    GEMINI_API_KEYS: 'KEY_A_1111,KEY_B_2222,KEY_C_3333',
    GEMINI_MODELS: 'M1',
    GEMINI_POOL_STATE_SYNC_MS: '0',
    GEMINI_RETRY_DELAY_MS: '0',
    ...env,
  });
  delete process.env.GEMINI_API_KEY;
  const axios = require('axios');
  axios.post = jest.fn();
  const pool = require('../src/geminiPool.service');
  const { callGemini } = require('../src/services/llm.service');
  const jobs = require('../src/jobs.service');
  const orchestrator = require('../src/orchestrator/websiteGeneration.orchestrator');
  return { axios, pool, callGemini, jobs, orchestrator };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GEMINI_CAPACITY_WAIT_MAX_MS;
});

describe('callGemini failover', () => {
  test('a project rate limit is absorbed inside one call and does not use an agent retry', async () => {
    const { axios, callGemini } = load();
    let firstKey = null;
    axios.post.mockImplementation(async (url) => {
      const key = keyOf(url);
      firstKey = firstKey || key;
      if (key === firstKey) throw rateLimit();
      return OK_BODY;
    });
    const out = await callGemini({ system: 's', input: { q: 1 } });
    expect(out.value).toEqual({ ok: true });
    expect(out.attempt).toBe(1);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('a validation error (400) is surfaced immediately and not retried across the pool', async () => {
    const { axios, callGemini } = load();
    axios.post.mockRejectedValue(Object.assign(new Error('bad'), { response: { status: 400, data: { error: { message: 'invalid argument' } } } }));
    await expect(callGemini({ system: 's', input: {} })).rejects.toThrow(/invalid argument/);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('invalid credentials are not retried indefinitely and no capacity wait happens', async () => {
    const { axios, callGemini } = load();
    axios.post.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 403, data: { error: { message: 'API key not valid' } } } }));
    const started = Date.now();
    await expect(callGemini({ system: 's', input: {} })).rejects.toMatchObject({ code: 'GEMINI_POOL_EXHAUSTED', temporary: false });
    expect(axios.post).toHaveBeenCalledTimes(3); // each credential once
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('temporary exhaustion with waiting disabled fails fast with a "temporary" marker', async () => {
    const { axios, callGemini } = load({ GEMINI_CAPACITY_WAIT_MAX_MS: '0' });
    jest.resetModules();
    const fresh = load({ GEMINI_CAPACITY_WAIT_MAX_MS: '0' });
    fresh.axios.post.mockRejectedValue(rateLimit('30s'));
    await expect(fresh.callGemini({ system: 's', input: {} })).rejects.toMatchObject({
      code: 'GEMINI_POOL_EXHAUSTED',
      temporary: true,
      userMessage: expect.stringMatching(/temporarily exhausted/),
    });
    expect(fresh.axios.post).toHaveBeenCalledTimes(3);
    expect(axios).toBeDefined();
    expect(callGemini).toBeDefined();
  });
});

describe('job continuity (Test 7)', () => {
  test('fallback project succeeds and the original job continues; completed stages are not re-run', async () => {
    const { axios, callGemini, jobs, orchestrator } = load();
    let blockedKey = null;
    axios.post.mockImplementation(async (url) => {
      const key = keyOf(url);
      if (blockedKey === null && axios.post.mock.calls.length === 2) blockedKey = key; // 2nd call (stage 2) hits a limited project
      if (key === blockedKey) throw rateLimit();
      return OK_BODY;
    });

    const stageRuns = { requirements: 0, code: 0 };
    orchestrator.generateWebsite.mockImplementation(async (payload, { onStage }) => {
      onStage('requirements', 'started'); stageRuns.requirements += 1;
      const req = await callGemini({ system: 'req', input: {} });
      onStage('requirements', 'completed', { name: 'requirements', status: 'completed' });
      onStage('code', 'started'); stageRuns.code += 1;
      const code = await callGemini({ system: 'code', input: { req: req.value } });
      onStage('code', 'completed', { name: 'code', status: 'completed' });
      return { files: { '/a.js': { code: 'x' } }, req: req.value, code: code.value };
    });

    const id = jobs.createJob({ mode: 'generate' });
    await until(() => jobs.getJob(id).status === 'completed' || jobs.getJob(id).status === 'failed');
    const job = jobs.getJob(id);
    expect(job.status).toBe('completed');
    expect(job.id).toBe(id); // same job id
    expect(stageRuns).toEqual({ requirements: 1, code: 1 }); // nothing restarted
    expect(orchestrator.generateWebsite).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(3); // 1 (stage 1) + 1 failed + 1 fallback project
  });

  test('temporary exhaustion: job shows "Waiting for Gemini capacity", frees its slot, then resumes and completes', async () => {
    process.env.AI_CONCURRENCY = '1';
    const { axios, callGemini, jobs, orchestrator } = load();
    let calls = 0;
    axios.post.mockImplementation(async () => {
      calls += 1;
      if (calls <= 3) throw rateLimit('0.3s'); // every project limited once, for 0.3s
      return OK_BODY;
    });

    let firstStages = 0;
    orchestrator.generateWebsite.mockImplementation(async (payload) => {
      if (payload.tag === 'slow') {
        firstStages += 1;
        const r = await callGemini({ system: 's', input: {} });
        return { tag: 'slow', value: r.value, attempt: r.attempt };
      }
      return { tag: 'fast' };
    });

    const slow = jobs.createJob({ mode: 'generate', tag: 'slow' });
    const fast = jobs.createJob({ mode: 'generate', tag: 'fast' }); // queued behind the slow job (AI_CONCURRENCY=1)

    await until(() => jobs.getJob(slow).stageStatus === 'waiting_for_capacity');
    expect(jobs.getJob(slow).statusMessage).toBe('Waiting for Gemini capacity');
    expect(jobs.getJob(slow).waitingUntil).toBeTruthy();

    // The waiting job gave its worker slot away, so the queued job completes first.
    await until(() => jobs.getJob(fast).status === 'completed');
    expect(jobs.getJob(slow).status).toBe('processing');

    await until(() => jobs.getJob(slow).status === 'completed');
    const done = jobs.getJob(slow);
    expect(done.result.attempt).toBe(1); // the wait did not consume the agent-retry budget
    expect(firstStages).toBe(1); // pipeline not restarted
    expect(calls).toBe(4); // 3 failed projects, then 1 success after the wait
  });

  test('capacity that never returns ends as a distinguishable temporary failure, not a generic build failure', async () => {
    const { axios, callGemini, jobs, orchestrator } = load({ GEMINI_CAPACITY_WAIT_MAX_MS: '0' });
    axios.post.mockRejectedValue(rateLimit('60s'));
    orchestrator.generateWebsite.mockImplementation(async () => { await callGemini({ system: 's', input: {} }); });

    const id = jobs.createJob({ mode: 'generate' });
    await until(() => jobs.getJob(id).status === 'failed');
    const job = jobs.getJob(id);
    expect(job.errorType).toBe('capacity_exhausted');
    expect(job.error).toMatch(/temporarily exhausted/i);
    expect(job.error).not.toMatch(/build/i);
  });
});
