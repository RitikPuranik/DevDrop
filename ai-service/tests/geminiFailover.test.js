/**
 * Gemini pool failover / cooldown isolation tests. Everything is mocked: no
 * network, no Mongo, no real Gemini quota is consumed.
 */
process.env.GEMINI_API_KEYS = 'KEY_A_1111,KEY_B_2222,KEY_C_3333';
process.env.GEMINI_POOL_STATE_SYNC_MS = '0';

const mongoose = require('mongoose');
const geminiPool = require('../src/geminiPool.service');
const GeminiApiKey = require('../src/models/geminiApiKey.model');
const GeminiPoolState = require('../src/models/geminiPoolState.model');
const { classify, cooldownMsFor, envMs } = require('../src/geminiFailureClassifier');

const { _internal } = geminiPool;
const mk = _internal.modelKey;
const A = 'KEY_A_1111';
const B = 'KEY_B_2222';
const C = 'KEY_C_3333';

function httpError(status, message, details) {
  const err = new Error(message || `HTTP ${status}`);
  err.response = { status, data: { error: { message: message || `HTTP ${status}`, details } } };
  return err;
}

function rateLimit({ retryDelay, quotaId, resetAt } = {}) {
  const details = [];
  if (retryDelay) details.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay });
  if (quotaId) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{ quotaId, quotaMetric: 'generativelanguage.googleapis.com/generate_content_requests' }],
    });
  }
  if (resetAt) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      metadata: { quotaResetTimeStamp: new Date(resetAt).toISOString() },
    });
  }
  return httpError(429, 'Resource has been exhausted (e.g. check quota).', details);
}

function resetPool() {
  process.env.GEMINI_API_KEYS = `${A},${B},${C}`;
  delete process.env.GEMINI_API_KEY;
  _internal.pool.clear();
  _internal.globalModelCooldowns.clear();
  _internal.bootstrapFromEnv();
}

let logSpy;
beforeEach(() => {
  resetPool();
  logSpy = [
    jest.spyOn(console, 'log').mockImplementation(() => {}),
    jest.spyOn(console, 'warn').mockImplementation(() => {}),
    jest.spyOn(console, 'error').mockImplementation(() => {}),
  ];
});
afterEach(() => {
  logSpy.forEach((s) => s.mockRestore());
  ['GEMINI_RATE_LIMIT_COOLDOWN_MS', 'GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS', 'GEMINI_POOL_MAX_COOLDOWN_MS',
    'GEMINI_MODEL_CAPACITY_COOLDOWN_MS'].forEach((k) => delete process.env[k]);
});

describe('Test 1: immediate failover', () => {
  test('Project A 429 -> Project B succeeds without waiting for A\'s cooldown', async () => {
    const order = entryOrder();
    const requestFn = jest.fn((rawKey) => (rawKey === order[0].rawKey ? Promise.reject(rateLimit()) : Promise.resolve('ok')));
    const started = Date.now();
    const out = await geminiPool.executeModels(['M1'], requestFn);

    expect(out.result).toBe('ok');
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(requestFn.mock.calls[1][0]).not.toBe(requestFn.mock.calls[0][0]);
    expect(Date.now() - started).toBeLessThan(500); // default internal cooldown is 5s
    expect(out.attempts).toBe(2);
    expect(out.projectsTried).toBe(2);
  });

  test('a rate limit on A leaves B and C fully available', async () => {
    const [first, second, third] = entryOrder();
    await geminiPool.executeModels(['M1'], (rawKey) => (rawKey === first.rawKey ? Promise.reject(rateLimit()) : Promise.resolve('ok')));
    expect(modelCooldownMs(first, 'M1')).toBeGreaterThan(0);
    expect(modelCooldownMs(second, 'M1')).toBe(0);
    expect(modelCooldownMs(third, 'M1')).toBe(0);
    expect(first.cooldownUntil).toBeNull(); // not a project-wide / pool-wide cooldown
  });
});

describe('Test 2: multiple consecutive rate limits', () => {
  test('A and B 429, C succeeds; all three handled', async () => {
    const [first, second, third] = entryOrder();
    const calls = [];
    const out = await geminiPool.executeModels(['M1'], (rawKey) => {
      calls.push(rawKey);
      return rawKey === third.rawKey ? Promise.resolve('ok') : Promise.reject(rateLimit());
    });
    expect(out.keyId).toBe(third.id);
    expect(calls).toEqual([first.rawKey, second.rawKey, third.rawKey]);
    expect(modelCooldownMs(first, 'M1')).toBeGreaterThan(0);
    expect(modelCooldownMs(second, 'M1')).toBeGreaterThan(0);
    expect(modelCooldownMs(third, 'M1')).toBe(0);
    expect(third.status).toBe('healthy');
  });
});

describe('Test 3: unavailable project is skipped', () => {
  test('A in cooldown is never requested', async () => {
    const [first] = entryOrder();
    first.modelCooldowns[mk('M1')] = new Date(Date.now() + 60_000);
    const requestFn = jest.fn().mockResolvedValue('ok');
    for (let i = 0; i < 4; i += 1) await geminiPool.executeModels(['M1'], requestFn);
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
  });

  test('a project-wide cooldown is skipped for every model', async () => {
    const [first] = entryOrder();
    first.cooldownUntil = new Date(Date.now() + 60_000);
    const requestFn = jest.fn().mockResolvedValue('ok');
    await geminiPool.executeModels(['M1', 'M2'], requestFn);
    await geminiPool.executeModels(['M2', 'M1'], requestFn);
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
  });

  test('an expired cooldown only makes the project eligible again (it is not assumed healthy)', async () => {
    const [first] = entryOrder();
    first.modelCooldowns[mk('M1')] = new Date(Date.now() - 10);
    const requestFn = jest.fn(() => Promise.reject(rateLimit()));
    await expect(geminiPool.executeModels(['M1'], requestFn)).rejects.toThrow();
    expect(requestFn.mock.calls.map((c) => c[0])).toContain(first.rawKey); // retried, 429 again, re-cooled
    expect(modelCooldownMs(first, 'M1')).toBeGreaterThan(0);
  });
});

describe('Test 4: all projects temporarily unavailable', () => {
  test('one bounded cycle, structured result, meaningful retry time', async () => {
    const requestFn = jest.fn(() => Promise.reject(rateLimit({ retryDelay: '12s' })));
    let error;
    try { await geminiPool.executeModels(['M1'], requestFn); } catch (e) { error = e; }

    expect(requestFn).toHaveBeenCalledTimes(3); // each project exactly once: no infinite loop
    expect(error.code).toBe('GEMINI_POOL_EXHAUSTED');
    expect(error.temporary).toBe(true);
    expect(error.shouldRetry).toBe(true);
    expect(error.attemptedProjects).toBe(3);
    expect(error.failureCategories).toEqual({ rate_limit: 3 });
    expect(error.reason).toBe('all_projects_rate_limited');
    expect(error.retryAfterMs).toBeGreaterThan(10_000);
    expect(error.retryAfterMs).toBeLessThanOrEqual(12_100);
    expect(new Date(error.retryAt).getTime()).toBeGreaterThan(Date.now());
    expect(error.attemptedKeyIds).toHaveLength(3);
  });

  test('all already cooling down: no request is made and the wait is reported', async () => {
    _internal.pool.forEach((e) => { e.modelCooldowns[mk('M1')] = new Date(Date.now() + 20_000); });
    const requestFn = jest.fn();
    let error;
    try { await geminiPool.executeModels(['M1'], requestFn); } catch (e) { error = e; }
    expect(requestFn).not.toHaveBeenCalled();
    expect(error.temporary).toBe(true);
    expect(error.retryAfterMs).toBeGreaterThan(15_000);
    expect(error.message).toMatch(/temporarily unavailable/);
  });

  test('a failover cycle never exceeds the number of projects x models', async () => {
    const requestFn = jest.fn(() => Promise.reject(rateLimit()));
    await expect(geminiPool.executeModels(['M1', 'M2'], requestFn)).rejects.toThrow();
    expect(requestFn.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe('Test 5: daily quota exhaustion', () => {
  test('waits for the quota reset, not for a short RetryInfo delay', async () => {
    const resetAt = Date.now() + 3_600_000;
    const dailyError = () => rateLimit({ retryDelay: '2s', quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', resetAt });
    expect(classify(dailyError()).classification).toBe('quota_exceeded');

    const [first] = entryOrder();
    await geminiPool.executeModels(['M1'], (rawKey) => (rawKey === first.rawKey ? Promise.reject(dailyError()) : Promise.resolve('ok')));
    expect(modelCooldownMs(first, 'M1')).toBeGreaterThan(3_500_000);

    // Short sleeps must not make it eligible again.
    const requestFn = jest.fn().mockResolvedValue('ok');
    for (let i = 0; i < 4; i += 1) await geminiPool.executeModels(['M1'], requestFn);
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
  });

  test('without reset metadata the documented midnight-Pacific reset is used, not the 2s hint', () => {
    const info = classify(rateLimit({ retryDelay: '2s', quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }));
    expect(info.classification).toBe('quota_exceeded');
    expect(info.quotaResetAt).toBeGreaterThan(Date.now());
    expect(cooldownMsFor(info, 1)).toBe(Math.max(0, info.quotaResetAt - Date.now()));
    expect(info.quotaResetAt - Date.now()).toBeGreaterThan(0);
    expect(info.quotaResetAt - Date.now()).toBeLessThanOrEqual(24 * 3_600_000 + 3_600_000);
  });

  test('all projects daily-exhausted reports a far retry time', async () => {
    const resetAt = Date.now() + 7_200_000;
    const requestFn = jest.fn(() => Promise.reject(rateLimit({ quotaId: 'GenerateRequestsPerDayPerProjectPerModel', resetAt })));
    let error;
    try { await geminiPool.executeModels(['M1'], requestFn); } catch (e) { error = e; }
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(error.reason).toBe('daily_quota_exhausted');
    expect(error.retryAfterMs).toBeGreaterThan(7_000_000);
  });
});

describe('Test 6: shared model-capacity failure', () => {
  test('503 avoids the MODEL, does not cool projects, falls to the next model', async () => {
    const requestFn = jest.fn((rawKey, model) => (model === 'M1'
      ? Promise.reject(httpError(503, 'The model is overloaded. Please try again later.'))
      : Promise.resolve('ok')));
    const out = await geminiPool.executeModels(['M1', 'M2'], requestFn);

    expect(out.model).toBe('M2');
    expect(requestFn.mock.calls.filter((c) => c[1] === 'M1')).toHaveLength(1); // not repeated on 100 projects
    expect(_internal.globalModelCooldowns.has(mk('M1'))).toBe(true);
    _internal.pool.forEach((e) => {
      expect(e.cooldownUntil).toBeNull();
      expect(modelCooldownMs(e, 'M1')).toBe(0);
      expect(e.status).not.toBe('rate_limited');
      expect(e.status).not.toBe('invalid');
    });

    // The next request skips M1 without even trying it.
    requestFn.mockClear();
    await geminiPool.executeModels(['M1', 'M2'], requestFn);
    expect(requestFn.mock.calls.map((c) => c[1])).toEqual(['M2']);
  });

  test('all models at capacity is reported as model_capacity, not as quota exhaustion', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(503, 'high demand')));
    let error;
    try { await geminiPool.executeModels(['M1', 'M2'], requestFn); } catch (e) { error = e; }
    expect(requestFn).toHaveBeenCalledTimes(2); // one probe per model, not per project
    expect(error.reason).toBe('model_capacity');
    expect(error.classification).toBe('capacity');
    expect(error.failureCategories).toEqual({ capacity: 2 });
    expect(error.temporary).toBe(true);
    _internal.pool.forEach((e) => expect(e.cooldownUntil).toBeNull());
  });

  test('a 429 that says "overloaded" with no quota metadata is capacity, not project quota', () => {
    expect(classify(httpError(429, 'The model is overloaded. Please try again later.')).classification).toBe('capacity');
    expect(classify(rateLimit({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' })).classification).toBe('rate_limit');
  });
});

describe('Test 8: invalid credentials', () => {
  test('A invalid -> B used; A is never retried or resurrected', async () => {
    const [first] = entryOrder();
    const seen = [];
    await geminiPool.executeModels(['M1', 'M2'], (rawKey) => {
      seen.push(rawKey);
      return rawKey === first.rawKey ? Promise.reject(httpError(403, 'API key not valid')) : Promise.resolve('ok');
    });
    expect(first.status).toBe('invalid');
    expect(seen.filter((k) => k === first.rawKey)).toHaveLength(1); // not retried on M2, M3...

    const requestFn = jest.fn().mockResolvedValue('ok');
    for (let i = 0; i < 6; i += 1) await geminiPool.executeModels(['M1', 'M2'], requestFn);
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
    expect(first.status).toBe('invalid'); // not flipped back to "degraded" with a 1s cooldown
    expect(first.cooldownUntil).toBeNull();
  });

  test('all credentials invalid -> permanent result, no retry advice, bounded requests', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(401, 'API key not valid. Please pass a valid API key.')));
    let error;
    try { await geminiPool.executeModels(['M1', 'M2'], requestFn); } catch (e) { error = e; }
    expect(requestFn).toHaveBeenCalledTimes(3);
    expect(error.temporary).toBe(false);
    expect(error.shouldRetry).toBe(false);
    expect(error.reason).toBe('no_usable_credentials');
    // and a follow-up call does not touch them again
    requestFn.mockClear();
    await expect(geminiPool.executeModels(['M1'], requestFn)).rejects.toMatchObject({ temporary: false });
    expect(requestFn).not.toHaveBeenCalled();
  });
});

describe('Test 9: concurrent jobs and shared state', () => {
  async function withFakeMongo(docs, fn) {
    const previousState = mongoose.connection._readyState;
    mongoose.connection._readyState = 1; // pretend Mongo is connected; every model call below is mocked
    jest.spyOn(GeminiApiKey, 'estimatedDocumentCount').mockResolvedValue(0);
    jest.spyOn(GeminiApiKey, 'find').mockImplementation(() => ({ select: () => ({ lean: async () => docs }) }));
    jest.spyOn(GeminiApiKey, 'findByIdAndUpdate').mockResolvedValue({});
    jest.spyOn(GeminiPoolState, 'find').mockImplementation(() => ({ lean: async () => [] }));
    jest.spyOn(GeminiPoolState, 'updateOne').mockResolvedValue({});
    jest.spyOn(GeminiPoolState, 'deleteOne').mockResolvedValue({});
    try { return await fn(); } finally { jest.restoreAllMocks(); mongoose.connection._readyState = previousState; }
  }

  test('cooldown written by another worker (shared state) is honored before any request', async () => {
    const [first] = entryOrder();
    const docs = [{ _id: first.id, cooldownUntil: null, modelCooldowns: { [mk('M1')]: new Date(Date.now() + 60_000) }, status: 'rate_limited' }];
    const requestFn = jest.fn().mockResolvedValue('ok');

    await withFakeMongo(docs, async () => {
      await Promise.all(Array.from({ length: 6 }, () => geminiPool.executeModels(['M1'], requestFn)));
    });
    expect(requestFn).toHaveBeenCalledTimes(6);
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
  });

  test('once A is rate limited, later concurrent waves never select it', async () => {
    const [first] = entryOrder();
    const requestFn = jest.fn(async (rawKey) => {
      await new Promise((r) => setTimeout(r, 10));
      if (rawKey === first.rawKey) throw rateLimit({ retryDelay: '30s' });
      return 'ok';
    });
    await Promise.all(Array.from({ length: 3 }, () => geminiPool.executeModels(['M1'], requestFn)));
    requestFn.mockClear();
    await Promise.all(Array.from({ length: 9 }, () => geminiPool.executeModels(['M1'], requestFn)));
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(first.rawKey);
    expect(requestFn).toHaveBeenCalledTimes(9);
  });

  test('keys of the same Google Cloud project share quota; duplicates are not extra capacity', async () => {
    const [first, second, third] = entryOrder();
    first.projectKey = '4242';
    second.projectKey = '4242';
    const requestFn = jest.fn((rawKey) => (rawKey === first.rawKey
      ? Promise.reject(rateLimit({ quotaId: 'GenerateRequestsPerMinute' /* no "model": project scope */, retryDelay: '30s' }))
      : Promise.resolve('ok')));
    const out = await geminiPool.executeModels(['M1'], requestFn);
    expect(out.keyId).toBe(third.id); // sibling key of the same project was skipped without a request
    expect(requestFn.mock.calls.map((c) => c[0])).not.toContain(second.rawKey);

    resetPool();
    _internal.pool.get('env-1').rawKey = A; // same credential twice
    _internal.pool.get('env-1').fingerprint = _internal.pool.get('env-0').fingerprint;
    _internal.markDuplicates();
    expect(_internal.pool.get('env-1').duplicateOf).toBe('env-0');
    const calls = jest.fn(() => Promise.reject(rateLimit()));
    await expect(geminiPool.executeModels(['M1'], calls)).rejects.toMatchObject({ attemptedProjects: 2 });
  });
});

describe('Test 10: environment variable parsing', () => {
  test('envMs: unset/blank/garbage/negative keep the default; explicit 0 is honored', () => {
    delete process.env.X_MS;
    expect(envMs('X_MS', 5000)).toBe(5000);
    process.env.X_MS = ''; expect(envMs('X_MS', 5000)).toBe(5000);
    process.env.X_MS = 'abc'; expect(envMs('X_MS', 5000)).toBe(5000);
    process.env.X_MS = '-3'; expect(envMs('X_MS', 5000)).toBe(5000);
    process.env.X_MS = '0'; expect(envMs('X_MS', 5000)).toBe(0);
    process.env.X_MS = '1500'; expect(envMs('X_MS', 5000)).toBe(1500);
    delete process.env.X_MS;
  });

  test('GEMINI_RATE_LIMIT_COOLDOWN_MS: default ~5s with jitter; 0 disables internal backoff only', () => {
    const info = { classification: 'rate_limit', retryAfterMs: 0, quotaResetAt: 0 };
    const def = cooldownMsFor(info, 1);
    expect(def).toBeGreaterThanOrEqual(4000);
    expect(def).toBeLessThanOrEqual(6000);

    process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS = '0';
    expect(cooldownMsFor(info, 1)).toBe(0);
    expect(cooldownMsFor(info, 5)).toBe(0);
    // provider guidance is still honored with the internal backoff disabled
    expect(cooldownMsFor({ ...info, retryAfterMs: 7000 }, 1)).toBe(7000);
  });

  test('GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS caps internal backoff but never a provider Retry-After', () => {
    process.env.GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS = '10000';
    const info = { classification: 'rate_limit', retryAfterMs: 0, quotaResetAt: 0 };
    expect(cooldownMsFor(info, 10)).toBeLessThanOrEqual(10000);
    expect(cooldownMsFor({ ...info, retryAfterMs: 90_000 }, 1)).toBe(90_000);
    process.env.GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS = '0';
    expect(cooldownMsFor(info, 3)).toBe(0);
  });

  test('GEMINI_MODEL_CAPACITY_COOLDOWN_MS: default 30s (no hidden 5s floor); 0 means no pool-wide avoidance', () => {
    const info = { classification: 'capacity', retryAfterMs: 0 };
    const def = cooldownMsFor(info, 1);
    expect(def).toBeGreaterThanOrEqual(24_000);
    expect(def).toBeLessThanOrEqual(36_000);
    process.env.GEMINI_MODEL_CAPACITY_COOLDOWN_MS = '3000';
    expect(cooldownMsFor(info, 1)).toBeLessThanOrEqual(3600);
    expect(cooldownMsFor(info, 1)).toBeGreaterThanOrEqual(2400);
    process.env.GEMINI_MODEL_CAPACITY_COOLDOWN_MS = '0';
    expect(cooldownMsFor(info, 1)).toBe(0);
  });

  test('GEMINI_POOL_MAX_COOLDOWN_MS caps transient backoff; repeated failures do not retry rapidly', () => {
    const info = { classification: 'transient', retryAfterMs: 0 };
    expect(cooldownMsFor(info, 1)).toBeGreaterThanOrEqual(1600);
    expect(cooldownMsFor(info, 5)).toBeGreaterThan(cooldownMsFor(info, 1));
    process.env.GEMINI_POOL_MAX_COOLDOWN_MS = '1000';
    expect(cooldownMsFor(info, 5)).toBeLessThanOrEqual(1000);
  });

  test('a configured cooldown of 0 still excludes the project for the rest of the current request', async () => {
    process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS = '0';
    const requestFn = jest.fn(() => Promise.reject(rateLimit()));
    await expect(geminiPool.executeModels(['M1'], requestFn)).rejects.toThrow();
    expect(requestFn).toHaveBeenCalledTimes(3); // each project once, no hot loop
  });
});

describe('Other error handling and safety', () => {
  test('transient 500 backs off per project and tries another project first', async () => {
    const [first] = entryOrder();
    const out = await geminiPool.executeModels(['M1'], (rawKey) => (rawKey === first.rawKey ? Promise.reject(httpError(500, 'internal')) : Promise.resolve('ok')));
    expect(out.keyId).not.toBe(first.id);
    expect(modelCooldownMs(first, 'M1')).toBeGreaterThan(1000);
  });

  test('validation errors are surfaced, not rotated across the pool', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(400, 'invalid argument: bad request')));
    await expect(geminiPool.executeModels(['M1'], requestFn)).rejects.toThrow(/invalid argument/);
    expect(requestFn).toHaveBeenCalledTimes(1);
    _internal.pool.forEach((e) => expect(e.cooldownUntil).toBeNull());
  });

  test('unusable JSON output is tried on a bounded number of projects without cooling them', async () => {
    const bad = () => Object.assign(new Error('Invalid generated JSON'), { retryableOutput: true, code: 'GEMINI_INVALID_GENERATED_JSON' });
    process.env.GEMINI_POOL_MAX_BAD_OUTPUT_ATTEMPTS = '2';
    const requestFn = jest.fn(() => Promise.reject(bad()));
    await expect(geminiPool.executeModels(['M1'], requestFn)).rejects.toThrow(/Invalid generated JSON/);
    expect(requestFn).toHaveBeenCalledTimes(2);
    _internal.pool.forEach((e) => expect(e.modelCooldowns[mk('M1')]).toBeUndefined());
    delete process.env.GEMINI_POOL_MAX_BAD_OUTPUT_ATTEMPTS;
  });

  test('raw API keys never reach the logs or the thrown error', async () => {
    const requestFn = jest.fn(() => Promise.reject(rateLimit({ retryDelay: '5s' })));
    let error;
    try { await geminiPool.executeModels(['M1'], requestFn); } catch (e) { error = e; }
    const written = JSON.stringify(logSpy.flatMap((s) => s.mock.calls));
    [A, B, C].forEach((key) => {
      expect(written).not.toContain(key);
      expect(String(error.message)).not.toContain(key);
      expect(JSON.stringify(error.result)).not.toContain(key);
    });
    expect(written).toContain('PROJECT RATE LIMITED');
    expect(written).toContain('SWITCHING PROJECT');
    expect(written).toContain('POOL EXHAUSTED');
  });

  test('expected 429s do not log stack traces', async () => {
    await expect(geminiPool.executeModels(['M1'], () => Promise.reject(rateLimit()))).rejects.toThrow();
    const written = JSON.stringify(logSpy.flatMap((s) => s.mock.calls));
    expect(written).not.toMatch(/\n\s+at /);
  });
});

// ---- helpers ----------------------------------------------------------------
// Selection order the pool will use (priority, then least recently used).
function entryOrder() {
  return Array.from(_internal.pool.values());
}
function modelCooldownMs(entry, model) {
  const until = entry.modelCooldowns?.[mk(model)];
  return until ? Math.max(0, new Date(until).getTime() - Date.now()) : 0;
}
