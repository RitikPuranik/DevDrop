// Minimal in-memory stand-in for the ioredis commands the cache service uses.
const store = new Map();
const ttls = new Map();
let failing = false;
const guard = () => { if (failing) throw new Error('redis down'); };
const mockRedis = {
  get: jest.fn(async (k) => { guard(); return store.has(k) ? store.get(k) : null; }),
  set: jest.fn(async (k, v, ...args) => {
    guard();
    if (args.includes('NX') && store.has(k)) return null;
    store.set(k, v);
    const exIdx = args.indexOf('EX'); if (exIdx >= 0) ttls.set(k, args[exIdx + 1]);
    return 'OK';
  }),
  unlink: jest.fn(async (...keys) => { guard(); let n = 0; keys.forEach((k) => { if (store.delete(k)) n += 1; }); return n; }),
  scan: jest.fn(async (cursor, _m, pattern) => {
    guard();
    const prefix = pattern.replace('*', '');
    return ['0', [...store.keys()].filter((k) => k.startsWith(prefix))];
  }),
};
jest.mock('../../../src/infrastructure/cache/connection', () => ({ getCacheClient: () => mockRedis, closeCacheClient: jest.fn() }));

const cache = require('../../../src/infrastructure/cache');

beforeEach(() => { store.clear(); ttls.clear(); failing = false; jest.clearAllMocks(); });

describe('cache service', () => {
  it('misses return undefined; hits return the stored JSON value', async () => {
    const k = cache.key('websites', 'browse', 1);
    expect(await cache.get(k)).toBeUndefined();
    await cache.set(k, { a: 1 }, 30);
    expect(await cache.get(k)).toEqual({ a: 1 });
  });

  it('always sets a TTL (nothing lives forever)', async () => {
    const k = cache.key('x', 'y');
    await cache.set(k, 1, 45);
    expect(ttls.get(k)).toBe(45);
    await cache.set(k, 1);
    expect(ttls.get(k)).toBeGreaterThan(0);
  });

  it('keys are prefixed and isolated per namespace and parts', () => {
    expect(cache.key('websites', 'a')).toMatch(/^devdrop:cache:v1:websites:/);
    expect(cache.key('websites', 'a')).not.toBe(cache.key('websites', 'b'));
    expect(cache.key('websites', 'a')).not.toBe(cache.key('other', 'a'));
    expect(cache.key('w', 'x'.repeat(500)).length).toBeLessThan(200);
  });

  it('refuses to cache oversized values', async () => {
    expect(await cache.set(cache.key('big', 1), 'x'.repeat(300 * 1024))).toBe(false);
  });

  it('invalidateNamespace removes only that namespace', async () => {
    await cache.set(cache.key('websites', 1), 1);
    await cache.set(cache.key('websites', 2), 2);
    await cache.set(cache.key('other', 1), 3);
    await cache.invalidateNamespace('websites');
    expect(await cache.get(cache.key('websites', 1))).toBeUndefined();
    expect(await cache.get(cache.key('other', 1))).toBe(3);
  });

  it('wrap loads once on a miss and serves the cached value afterwards', async () => {
    const loader = jest.fn(async () => ({ n: 1 }));
    const k = cache.key('w', 'once');
    expect(await cache.wrap(k, 30, loader)).toEqual({ n: 1 });
    expect(await cache.wrap(k, 30, loader)).toEqual({ n: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('wrap prevents a stampede: concurrent misses run the loader once', async () => {
    let calls = 0;
    const loader = async () => { calls += 1; await new Promise((r) => setTimeout(r, 150)); return 'v'; };
    const k = cache.key('w', 'stampede');
    const results = await Promise.all([1, 2, 3, 4].map(() => cache.wrap(k, 30, loader)));
    expect(results).toEqual(['v', 'v', 'v', 'v']);
    expect(calls).toBe(1);
  });

  it('falls back to the loader when the cache is down (safe degradation)', async () => {
    failing = true;
    const loader = jest.fn(async () => 'from-db');
    expect(await cache.wrap(cache.key('w', 'down'), 30, loader)).toBe('from-db');
    expect(await cache.get(cache.key('w', 'down'))).toBeUndefined();
    expect(await cache.set(cache.key('w', 'down'), 1)).toBe(false);
  });

  it('a loader error is not cached and releases the lock', async () => {
    const k = cache.key('w', 'err');
    await expect(cache.wrap(k, 30, async () => { throw new Error('db'); })).rejects.toThrow('db');
    expect(await cache.wrap(k, 30, async () => 'ok')).toBe('ok');
  });
});
