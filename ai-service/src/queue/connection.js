'use strict';

const IORedis = require('ioredis');

// QUEUE_REDIS_URL is used exclusively by BullMQ. ai-service never touches the cache database.

const maskRedisUrl = (url) => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '[invalid redis url]';
  }
};

function createQueueRedisConnection(name = 'ai-worker') {
  const url = process.env.QUEUE_REDIS_URL;
  if (!url) throw new Error('QUEUE_REDIS_URL is not configured (BullMQ needs the Upstash queue database).');
  const options = {
    maxRetriesPerRequest: null, // required by BullMQ workers
    enableReadyCheck: false,
    connectTimeout: 15000,
    retryStrategy: (times) => Math.min(times * 500, 10000),
    connectionName: `devdrop:${name}`,
  };
  if (url.startsWith('rediss://')) options.tls = { servername: new URL(url).hostname };
  const connection = new IORedis(url, options);
  connection.on('error', (err) => console.error(`[queue-redis:${name}] ${maskRedisUrl(url)} error: ${err.code || err.message}`));
  return connection;
}

module.exports = { createQueueRedisConnection, maskRedisUrl };
