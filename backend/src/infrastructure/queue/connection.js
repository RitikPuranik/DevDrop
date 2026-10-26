'use strict';

const IORedis = require('ioredis');

// QUEUE_REDIS_URL is used exclusively by BullMQ. Nothing in this file may ever read
// CACHE_REDIS_URL, and there is deliberately no fallback to it (or to any other URL).

const maskRedisUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '[invalid redis url]';
  }
};

const requireQueueRedisUrl = () => {
  const url = process.env.QUEUE_REDIS_URL;
  if (!url) {
    throw new Error('QUEUE_REDIS_URL is not configured (BullMQ needs the Upstash queue database).');
  }
  return url;
};

// Upstash: use the TCP/TLS endpoint (rediss://...) — BullMQ cannot run over the REST API.
// BullMQ requires maxRetriesPerRequest: null on worker connections; enableReadyCheck
// is disabled because Upstash restricts INFO on some plans.
const buildOptions = (extra = {}) => ({
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 15000,
  retryStrategy: (times) => Math.min(times * 500, 10000),
  ...extra,
});

const createQueueRedisConnection = (name = 'bullmq', extra = {}) => {
  const url = requireQueueRedisUrl();
  const options = buildOptions({ connectionName: `devdrop:${name}`, ...extra });
  // Upstash only accepts TLS. A plain redis:// URL pointing at *.upstash.io is reset by the server
// (ECONNRESET), so enable TLS for it too instead of requiring everyone to remember "rediss://".
  if (url.startsWith('rediss://') || /\.upstash\.io$/i.test(new URL(url).hostname)) {
    options.tls = { servername: new URL(url).hostname };
  }
  const connection = new IORedis(url, options);
  connection.on('error', (err) => {
    // Never print the URL or credentials.
    console.error(`[queue-redis:${name}] ${maskRedisUrl(url)} error: ${err.code || err.message}`);
  });
  return connection;
};

module.exports = { createQueueRedisConnection, maskRedisUrl, requireQueueRedisUrl };
