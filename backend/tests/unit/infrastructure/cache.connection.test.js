describe('cache connection', () => {
  const saved = { ...process.env };
  beforeEach(() => { jest.resetModules(); });
  afterEach(() => { process.env = { ...saved }; });

  it('is disabled (null client) without CACHE_REDIS_URL, even when QUEUE_REDIS_URL is set', () => {
    delete process.env.CACHE_REDIS_URL;
    process.env.QUEUE_REDIS_URL = 'rediss://queue.example:6379';
    const { getCacheClient } = require('../../../src/infrastructure/cache/connection');
    expect(getCacheClient()).toBeNull();
  });

  it('a disabled cache means cache-aside simply calls the loader', async () => {
    delete process.env.CACHE_REDIS_URL;
    const cache = require('../../../src/infrastructure/cache');
    const loader = jest.fn(async () => 42);
    expect(await cache.wrap(cache.key('x', 1), 10, loader)).toBe(42);
    expect(await cache.get(cache.key('x', 1))).toBeUndefined();
  });
});
