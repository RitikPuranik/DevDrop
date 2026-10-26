/**
 * End-to-end-ish tests through callGemini() and the ai-queue job processor with
 * a mocked HTTP layer and a mocked backend. No network, no Redis, no Mongo, no real Gemini quota.
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
  const { createAiProcessor } = require('../src/queue/worker');
  const orchestrator = require('../src/orchestrator/websiteGeneration.orchestrator');
  // Stand-in for the backend the worker reports to; records what the user would see.
  const events = [];
  const backend = {
    fetchPayload: jest.fn(async () => ({ mode: 'generate', payload: { mode: 'generate', ...(load.payload || {}) } })),
    sendEvent: jest.fn(async (event, jobId, body) => { events.push({ event, ...body }); return {}; }),
    deliverTerminal: jest.fn(async (event, jobId, body) => { events.push({ event, ...body }); return {}; }),
  };
  const runJob = (payload = {}) => {
    load.payload = payload;
    const job = { data: { jobKey: 'job-1' }, attemptsMade: 0, updateProgress: jest.fn().mockResolvedValue(), updateData: jest.fn(), moveToDelayed: jest.fn() };
    return createAiProcessor({ backend })(job, 'tok');
  };
  return { axios, pool, callGemini, runJob, events, backend, orchestrator };
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
    const { axios, callGemini, runJob, events, orchestrator } = load();
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

    await runJob();
    expect(stageRuns).toEqual({ requirements: 1, code: 1 }); // nothing restarted
    expect(orchestrator.generateWebsite).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledTimes(3); // 1 (stage 1) + 1 failed + 1 fallback project
    expect(events.filter((e) => e.event === 'completed')).toHaveLength(1);
    expect(events.some((e) => e.event === 'failed')).toBe(false);
  });

  test('temporary exhaustion: job reports "Waiting for Gemini capacity", then resumes and completes', async () => {
    const { axios, callGemini, runJob, events, orchestrator } = load();
    let calls = 0;
    axios.post.mockImplementation(async () => {
      calls += 1;
      if (calls <= 3) throw rateLimit('0.3s'); // every project limited once, for 0.3s
      return OK_BODY;
    });

    let stages = 0;
    orchestrator.generateWebsite.mockImplementation(async () => {
      stages += 1;
      const r = await callGemini({ system: 's', input: {} });
      return { value: r.value, attempt: r.attempt };
    });

    await runJob();
    const waiting = events.find((e) => e.status === 'waiting_for_capacity');
    expect(waiting).toBeTruthy();
    expect(waiting.details.message).toBe('Waiting for Gemini capacity');
    expect(waiting.details.retryAt).toBeTruthy();
    // After the wait the job reports it is processing again, then completes.
    const idxWaiting = events.indexOf(waiting);
    expect(events.slice(idxWaiting + 1).some((e) => e.status === 'processing')).toBe(true);
    const done = events.find((e) => e.event === 'completed');
    expect(done.result.attempt).toBe(1); // the wait did not consume the agent-retry budget
    expect(stages).toBe(1); // pipeline not restarted
    expect(calls).toBe(4); // 3 failed projects, then 1 success after the wait
  });

  test('capacity that never returns ends as a distinguishable temporary failure, not a generic build failure', async () => {
    const { axios, callGemini, runJob, events, orchestrator } = load({ GEMINI_CAPACITY_WAIT_MAX_MS: '0' });
    axios.post.mockRejectedValue(rateLimit('60s'));
    orchestrator.generateWebsite.mockImplementation(async () => { await callGemini({ system: 's', input: {} }); });

    // The processor surfaces an unrecoverable error; the worker's 'failed' handler reports it with errorType.
    const err = await runJob().catch((e) => e);
    expect(err.name).toBe('UnrecoverableError');
    expect(err.errorType).toBe('capacity_exhausted');
    expect(err.message).toMatch(/temporarily exhausted/i);
    expect(err.message).not.toMatch(/build/i);
    expect(events.some((e) => e.event === 'completed')).toBe(false);
  });
});
