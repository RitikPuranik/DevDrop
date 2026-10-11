'use strict';

const crypto = require('crypto');
const { getCacheClient } = require('./connection');

// Small cache-aside helper. MongoDB stays the source of truth: every failure path
// (no URL, Redis down, bad JSON, oversized value) degrades to calling the loader.

const PREFIX = 'devdrop:cache:v1:';
const MAX_VALUE_BYTES = Number.parseInt(process.env.CACHE_MAX_VALUE_BYTES || String(256 * 1024), 10);
const DEFAULT_TTL_SEC = Number.parseInt(process.env.CACHE_DEFAULT_TTL_SEC || '60', 10);
const LOCK_TTL_MS = 10000;
const LOCK_WAIT_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only public, user-independent namespaces may be cached through this helper.
// scope() builds keys; anything user-specific must carry the user id in its parts
// (and the controllers using it today cache public data only).
const key = (namespace, ...parts) => {
  const tail = parts.map((p) => (p == null ? '_' : String(p))).join(':');
  const hashed = tail.length > 120 ? crypto.createHash('sha1').update(tail).digest('hex') : tail;
  return `${PREFIX}${namespace}:${hashed}`;
};

const get = async (k) => {
  const redis = getCacheClient();
  if (!redis) return undefined;
  try {
    const raw = await redis.get(k);
    if (raw == null) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const set = async (k, value, ttlSec = DEFAULT_TTL_SEC) => {
  const redis = getCacheClient();
  if (!redis || value === undefined) return false;
  try {
    const raw = JSON.stringify(value);
    if (Buffer.byteLength(raw) > MAX_VALUE_BYTES) return false;
    // TTL is mandatory: nothing in the cache may live forever.
    await redis.set(k, raw, 'EX', Math.max(1, Math.floor(ttlSec)));
    return true;
  } catch {
    return false;
  }
};

const del = async (...keys) => {
  const redis = getCacheClient();
  if (!redis || keys.length === 0) return 0;
  try {
    return await redis.unlink(...keys);
  } catch {
    return 0;
  }
};

// Deletes every key in a namespace. Writes are rare compared to reads, so SCAN is acceptable.
const invalidateNamespace = async (namespace) => {
  const redis = getCacheClient();
  if (!redis) return 0;
  let removed = 0;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}${namespace}:*`, 'COUNT', 200);
      cursor = next;
      if (keys.length) removed += await redis.unlink(...keys);
    } while (cursor !== '0');
  } catch {
    // Entries still expire through their TTL.
  }
  return removed;
};

/**
 * cache-aside with stampede protection:
 *  1. hit -> return
 *  2. miss -> try to take a short NX lock; the winner loads and stores
 *  3. losers briefly wait for the winner's value, then fall back to loading themselves
 */
const wrap = async (k, ttlSec, loader) => {
  const hit = await get(k);
  if (hit !== undefined) return hit;

  const redis = getCacheClient();
  if (!redis) return loader();

  const lockKey = `${k}:lock`;
  let haveLock = false;
  try {
    haveLock = (await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
  } catch {
    return loader();
  }

  if (!haveLock) {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(100);
      const value = await get(k);
      if (value !== undefined) return value;
    }
    return loader();
  }

  try {
    const value = await loader();
    await set(k, value, ttlSec);
    return value;
  } finally {
    await del(lockKey);
  }
};

module.exports = { key, get, set, del, wrap, invalidateNamespace, PREFIX };
