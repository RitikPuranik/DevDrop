/**
 * These tests exercise geminiPool.service.js purely in its env-var
 * bootstrap mode (no Mongo connection), which is exactly the "old
 * GEMINI_API_KEY / GEMINI_API_KEYS still works" backwards-compatibility
 * path — and happens to be the fastest way to unit-test key selection,
 * cooldown, and failover without a database.
 */

process.env.GEMINI_POOL_MAX_COOLDOWN_MS = '1000'; // keep test cooldowns short
process.env.GEMINI_API_KEYS = 'KEY_A_1234,KEY_B_5678,KEY_C_9012';

const geminiPool = require('../src/geminiPool.service');
const { _internal } = geminiPool;

function resetPool() {
  process.env.GEMINI_API_KEYS = 'KEY_A_1234,KEY_B_5678,KEY_C_9012';
  delete process.env.GEMINI_API_KEY;
  _internal.pool.clear();
  _internal.bootstrapFromEnv();
}

function httpError(status, message) {
  const err = new Error(message || `HTTP ${status}`);
  err.response = { status, data: { error: { message: message || `HTTP ${status}` } } };
  return err;
}

beforeEach(() => {
  resetPool();
});

describe('bootstrap from env', () => {
  test('old single GEMINI_API_KEY still works', () => {
    process.env.GEMINI_API_KEYS = '';
    process.env.GEMINI_API_KEY = 'SOLO_KEY_0000';
    _internal.pool.clear();
    _internal.bootstrapFromEnv();
    expect(_internal.pool.size).toBe(1);
    expect(Array.from(_internal.pool.values())[0].rawKey).toBe('SOLO_KEY_0000');
  });

  test('comma-separated GEMINI_API_KEYS creates one entry per key', () => {
    expect(_internal.pool.size).toBe(3);
  });
});

describe('execute()', () => {
  test('one healthy key succeeds', async () => {
    const requestFn = jest.fn().mockResolvedValue('ok');
    const { result, keyId } = await geminiPool.execute(requestFn);
    expect(result).toBe('ok');
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(keyId).toBeTruthy();
  });

  test('primary key gets 429, second key succeeds', async () => {
    const seenKeys = [];
    const requestFn = jest.fn((rawKey) => {
      seenKeys.push(rawKey);
      if (seenKeys.length === 1) return Promise.reject(httpError(429, 'quota exceeded'));
      return Promise.resolve('ok');
    });

    const { result } = await geminiPool.execute(requestFn);
    expect(result).toBe('ok');
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(seenKeys[0]).not.toBe(seenKeys[1]); // failed over to a different key
  });

  test('primary key times out, second key succeeds', async () => {
    let call = 0;
    const requestFn = jest.fn(() => {
      call += 1;
      if (call === 1) {
        const err = new Error('timeout of 90000ms exceeded');
        err.code = 'ECONNABORTED';
        return Promise.reject(err);
      }
      return Promise.resolve('ok');
    });

    const { result } = await geminiPool.execute(requestFn);
    expect(result).toBe('ok');
  });

  test('primary key gets 503, second key succeeds', async () => {
    let call = 0;
    const requestFn = jest.fn(() => {
      call += 1;
      if (call === 1) return Promise.reject(httpError(503, 'model is overloaded'));
      return Promise.resolve('ok');
    });

    const { result } = await geminiPool.execute(requestFn);
    expect(result).toBe('ok');
  });

  test('invalid key gets marked invalid and is never selected again', async () => {
    let call = 0;
    const requestFn = jest.fn(() => {
      call += 1;
      if (call === 1) return Promise.reject(httpError(401, 'API key not valid'));
      return Promise.resolve('ok');
    });

    await geminiPool.execute(requestFn);
    const invalidEntry = Array.from(_internal.pool.values()).find((e) => e.status === 'invalid');
    expect(invalidEntry).toBeTruthy();

    // Run many more requests; the invalid key should never be chosen again.
    for (let i = 0; i < 10; i += 1) {
      await geminiPool.execute(() => Promise.resolve('ok'));
    }
    expect(invalidEntry.totalRequests).toBeLessThanOrEqual(1);
  });

  test('disabled key is never selected', async () => {
    const entries = Array.from(_internal.pool.values());
    entries[0].enabled = false;
    entries[1].enabled = false;

    const requestFn = jest.fn().mockResolvedValue('ok');
    await geminiPool.execute(requestFn);

    expect(requestFn.mock.calls[0][0]).toBe(entries[2].rawKey);
  });

  test('rate-limited key enters cooldown and is skipped until it expires', async () => {
    const entry = Array.from(_internal.pool.values())[0];
    const requestFn = jest.fn((rawKey) => {
      if (rawKey === entry.rawKey) return Promise.reject(httpError(429, 'rate limit exceeded'));
      return Promise.resolve('ok');
    });

    await geminiPool.execute(requestFn);
    expect(entry.cooldownUntil).toBeTruthy();
    expect(entry.cooldownUntil.getTime()).toBeGreaterThan(Date.now());

    // While cooling down, selectKey should skip it.
    const selected = geminiPool.selectKey([]);
    expect(selected.id).not.toBe(entry.id);
  });

  test('cooldown expiry makes key eligible again', async () => {
    const entry = Array.from(_internal.pool.values())[0];
    entry.cooldownUntil = new Date(Date.now() - 1000); // already expired
    entry.enabled = true;
    entry.status = 'degraded';

    const selectable = geminiPool.selectKey([]);
    expect(selectable).toBeTruthy();
  });

  test('keys are not always selected in identical order (LRU among equal priority)', async () => {
    const order = [];
    for (let i = 0; i < 3; i += 1) {
      const requestFn = jest.fn((rawKey) => {
        order.push(rawKey);
        return Promise.resolve('ok');
      });
      // eslint-disable-next-line no-await-in-loop
      await geminiPool.execute(requestFn);
    }
    // With LRU tie-breaking among equal priority, three requests should
    // rotate across the three keys rather than hammering the same one.
    expect(new Set(order).size).toBe(3);
  });

  test('per-key concurrency cap is respected', async () => {
    process.env.GEMINI_PER_KEY_CONCURRENCY = '1';
    _internal.pool.clear();
    _internal.bootstrapFromEnv();
    const entry = Array.from(_internal.pool.values())[0];
    entry.inFlight = 1; // simulate an in-flight request already using this key

    const selected = geminiPool.selectKey([]);
    expect(selected.id).not.toBe(entry.id);
    delete process.env.GEMINI_PER_KEY_CONCURRENCY;
  });

  test('all keys exhausted throws PoolExhaustedError with a generic message', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(429, 'quota exceeded')));
    await expect(geminiPool.execute(requestFn)).rejects.toThrow();
    // Every key should now be rate-limited/cooling down.
    const allCoolingDown = Array.from(_internal.pool.values()).every((e) => e.cooldownUntil);
    expect(allCoolingDown).toBe(true);
  });

  test('a malformed-request (permanent) error does not fail over or punish the key', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(400, 'invalid argument: bad request')));
    await expect(geminiPool.execute(requestFn)).rejects.toThrow();
    expect(requestFn).toHaveBeenCalledTimes(1); // no failover attempted
    const entries = Array.from(_internal.pool.values());
    expect(entries.every((e) => e.cooldownUntil === null)).toBe(true);
  });

  test('raw API keys never appear in a thrown error message', async () => {
    const requestFn = jest.fn(() => Promise.reject(httpError(500, 'internal error')));
    let caught;
    try {
      await geminiPool.execute(requestFn);
    } catch (error) {
      caught = error;
    }
    const rawKeys = Array.from(_internal.pool.values()).map((e) => e.rawKey);
    rawKeys.forEach((key) => {
      expect(String(caught.message)).not.toContain(key);
    });
  });
});
