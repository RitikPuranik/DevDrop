'use strict';

const IORedis = require('ioredis');

// CACHE_REDIS_URL is used exclusively for disposable cache data.
// No fallback to QUEUE_REDIS_URL (or anything else): without it, caching is simply off.

let client = null;
let disabled = false;

const maskRedisUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '[invalid redis url]';
  }
};

const getCacheClient = () => {
  if (disabled) return null;
  if (client) return client;
  const url = process.env.CACHE_REDIS_URL;
  if (!url) {
    disabled = true;
    return null;
  }
  const options = {
    // Fail fast: a slow/broken cache must never hold up a request that MongoDB can answer.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    commandTimeout: 1500,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 1000, 15000),
    connectionName: 'devdrop:cache',
  };
  // Upstash only accepts TLS. A plain redis:// URL pointing at *.upstash.io is reset by the server
// (ECONNRESET), so enable TLS for it too instead of requiring everyone to remember "rediss://".
  if (url.startsWith('rediss://') || /\.upstash\.io$/i.test(new URL(url).hostname)) {
    options.tls = { servername: new URL(url).hostname };
  }
  client = new IORedis(url, options);
  let lastLogged = 0;
  client.on('error', (err) => {
    if (Date.now() - lastLogged > 30000) {
      lastLogged = Date.now();
      console.warn(`[cache-redis] ${maskRedisUrl(url)} unavailable: ${err.code || err.message}`);
    }
  });
  return client;
};

const closeCacheClient = async () => {
  if (!client) return;
  const c = client;
  client = null;
  await c.quit().catch(() => c.disconnect());
};

// Test hook only.
const _reset = () => { client = null; disabled = false; };

module.exports = { getCacheClient, closeCacheClient, maskRedisUrl, _reset };
