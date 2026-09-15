const mongoose = require('mongoose');
const GeminiApiKey = require('./models/geminiApiKey.model');
const { decrypt } = require('./utils/crypto');
const { classify, cooldownForFailure } = require('./geminiFailureClassifier');

/**
 * Maintains a pool of Gemini credentials with per-credential state, and
 * wraps a single "make one Gemini request for this model" function with
 * key selection + automatic failover. Model fallback (which Gemini model
 * to try) stays in gemini.service.js and is orthogonal to this.
 *
 * Config (label/enabled/priority/encryptedKey) is read from Mongo via a
 * short-TTL cache — see loadPool(). Live health/usage state (cooldowns,
 * consecutive failures, in-flight counts) lives in the `pool` Map in this
 * process's memory for fast selection, and is mirrored back to Mongo
 * best-effort so the admin UI and a future restart both see it.
 *
 * Backwards compatibility: if Mongo isn't connected, or the collection is
 * empty, falls back to GEMINI_API_KEY (single key) or GEMINI_API_KEYS
 * (comma-separated migration bootstrap) from the environment. Those
 * bootstrap entries are virtual (id starts with "env-") and are never
 * persisted — they exist only in memory for this process's lifetime.
 */

const POOL_REFRESH_MS = Number.parseInt(process.env.GEMINI_POOL_REFRESH_MS || '5000', 10);
const DAILY_TOKEN_LIMIT = Number.parseInt(process.env.GEMINI_DAILY_TOKEN_LIMIT || '1500000', 10);
function getPerKeyConcurrency() {
  const raw = Number.parseInt(process.env.GEMINI_PER_KEY_CONCURRENCY || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : Infinity;
}

/** @type {Map<string, object>} keyId -> runtime+config state */
const pool = new Map();
let lastLoadedAt = 0;
let loadingPromise = null;

function isMongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function bootstrapFromEnv() {
  pool.clear();
  const single = (process.env.GEMINI_API_KEY || '').trim();
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const rawKeys = multi.length > 0 ? multi : single && single !== 'your_gemini_api_key_here' ? [single] : [];

  rawKeys.forEach((rawKey, index) => {
    const id = `env-${index}`;
    pool.set(id, {
      id,
      persisted: false,
      label: rawKeys.length > 1 ? `Env key ${index + 1}` : 'Default (GEMINI_API_KEY)',
      rawKey,
      enabled: true,
      // Same priority tier for every env-bootstrapped key (matching the
      // Mongo model's shared default of 100) so they round-robin via LRU
      // instead of always hammering "key 1" — explicit ordering is an
      // admin-UI concept, and env-var bootstrap has no ordering signal to
      // honor besides list position, which isn't a strong enough one.
      priority: 0,
      status: 'healthy',
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastUsedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      inFlight: 0,
      // Token usage tracking
      totalTokensUsed: 0,
      promptTokensUsed: 0,
      candidateTokensUsed: 0,
      dailyTokensUsed: 0,
      lastTokenResetAt: null,
    });
  });
}

/**
 * Refreshes `pool` from Mongo, preserving live runtime fields (cooldown,
 * consecutive failures, in-flight count, lastUsedAt) for keys that already
 * exist so a routine config refresh never clobbers active health state.
 * New keys are added; deleted keys are dropped (an in-flight request on a
 * deleted key already holds its own decrypted copy and finishes fine).
 */
async function loadFromDB() {
  const docs = await GeminiApiKey.find().select('+encryptedKey');
  const seenIds = new Set();

  for (const doc of docs) {
    const id = String(doc._id);
    seenIds.add(id);
    let rawKey;
    try {
      rawKey = decrypt(doc.encryptedKey);
    } catch (error) {
      console.error(`Gemini pool: failed to decrypt key ${id}, skipping`, error.message);
      continue;
    }

    const existing = pool.get(id);
    pool.set(id, {
      id,
      persisted: true,
      label: doc.label,
      rawKey,
      enabled: doc.enabled,
      priority: doc.priority,
      // Live fields: keep existing runtime state if we have it, otherwise
      // seed from the DB's last-known values (covers a fresh process start).
      status: existing?.status ?? doc.status,
      consecutiveFailures: existing?.consecutiveFailures ?? doc.consecutiveFailures ?? 0,
      cooldownUntil: existing?.cooldownUntil ?? doc.cooldownUntil ?? null,
      lastUsedAt: existing?.lastUsedAt ?? doc.lastUsedAt ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? doc.lastSuccessAt ?? null,
      lastFailureAt: existing?.lastFailureAt ?? doc.lastFailureAt ?? null,
      lastErrorCode: existing?.lastErrorCode ?? doc.lastErrorCode ?? null,
      lastErrorMessage: existing?.lastErrorMessage ?? doc.lastErrorMessage ?? null,
      totalRequests: existing?.totalRequests ?? doc.totalRequests ?? 0,
      totalSuccesses: existing?.totalSuccesses ?? doc.totalSuccesses ?? 0,
      totalFailures: existing?.totalFailures ?? doc.totalFailures ?? 0,
      inFlight: existing?.inFlight ?? 0,
      // Token usage tracking
      totalTokensUsed: existing?.totalTokensUsed ?? doc.totalTokensUsed ?? 0,
      promptTokensUsed: existing?.promptTokensUsed ?? doc.promptTokensUsed ?? 0,
      candidateTokensUsed: existing?.candidateTokensUsed ?? doc.candidateTokensUsed ?? 0,
      dailyTokensUsed: existing?.dailyTokensUsed ?? doc.dailyTokensUsed ?? 0,
      lastTokenResetAt: existing?.lastTokenResetAt ?? doc.lastTokenResetAt ?? null,
    });
  }

  // Drop keys removed from the DB (but never drop env-bootstrap entries —
  // those have no DB doc to begin with).
  for (const id of Array.from(pool.keys())) {
    if (!id.startsWith('env-') && !seenIds.has(id)) pool.delete(id);
  }
}

async function loadPool(force = false) {
  const stale = force || Date.now() - lastLoadedAt > POOL_REFRESH_MS;
  if (!stale) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      if (isMongoReady()) {
        const count = await GeminiApiKey.estimatedDocumentCount();
        if (count > 0) {
          await loadFromDB();
        } else if (pool.size === 0) {
          bootstrapFromEnv();
        }
      } else if (pool.size === 0) {
        bootstrapFromEnv();
      }
      lastLoadedAt = Date.now();
    } catch (error) {
      console.error('Gemini pool: failed to load pool config', error.message);
      if (pool.size === 0) bootstrapFromEnv();
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** Force-drop the cache so the next request re-reads Mongo immediately. */
function invalidate() {
  lastLoadedAt = 0;
}

function isUsable(entry, excludeIds, now) {
  if (!entry.enabled) return false;
  if (entry.status === 'invalid' || entry.status === 'disabled') return false;
  if (excludeIds.includes(entry.id)) return false;
  if (entry.cooldownUntil && new Date(entry.cooldownUntil).getTime() > now) return false;
  if (entry.inFlight >= getPerKeyConcurrency()) return false;
  return true;
}

/**
 * Picks the best available key: enabled, not in cooldown, under its
 * per-key concurrency cap, lowest priority number first, and among equal
 * priority the least-recently-used — so a healthy pool doesn't just
 * hammer whichever key happens to be priority 1 forever.
 */
function selectKey(excludeIds = []) {
  const now = Date.now();
  const candidates = Array.from(pool.values()).filter((entry) => isUsable(entry, excludeIds, now));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aLast = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bLast = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return aLast - bLast; // least-recently-used first
  });

  return candidates[0];
}

function shortestCooldownRemaining(excludeIds = []) {
  const now = Date.now();
  const relevant = Array.from(pool.values()).filter(
    (e) => e.enabled && e.status !== 'invalid' && e.status !== 'disabled' && !excludeIds.includes(e.id)
  );
  const cooldowns = relevant
    .map((e) => (e.cooldownUntil ? new Date(e.cooldownUntil).getTime() - now : 0))
    .filter((ms) => ms > 0);
  if (cooldowns.length === 0) return null;
  return Math.min(...cooldowns);
}

function persistAsync(id, update) {
  if (id.startsWith('env-')) return; // virtual bootstrap key, nothing to persist
  GeminiApiKey.findByIdAndUpdate(id, update).catch((error) => {
    console.error(`Gemini pool: failed to persist state for key ${id}`, error.message);
  });
}

function markAcquired(entry) {
  entry.inFlight += 1;
  entry.lastUsedAt = new Date();
  entry.totalRequests += 1;
  entry.status = entry.status === 'invalid' || entry.status === 'disabled' ? entry.status : 'busy';
  persistAsync(entry.id, { lastUsedAt: entry.lastUsedAt, $inc: { totalRequests: 1 } });
}

function markSuccess(entry) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  entry.consecutiveFailures = 0;
  entry.cooldownUntil = null;
  entry.status = 'healthy';
  entry.lastSuccessAt = new Date();
  entry.totalSuccesses += 1;
  entry.lastErrorCode = null;
  entry.lastErrorMessage = null;
  persistAsync(entry.id, {
    status: 'healthy',
    consecutiveFailures: 0,
    cooldownUntil: null,
    lastSuccessAt: entry.lastSuccessAt,
    lastErrorCode: null,
    lastErrorMessage: null,
    $inc: { totalSuccesses: 1 },
  });
}

/**
 * Resets dailyTokensUsed if the last reset was on a different calendar day.
 */
function maybeResetDailyTokens(entry) {
  const now = new Date();
  const lastReset = entry.lastTokenResetAt ? new Date(entry.lastTokenResetAt) : null;
  if (!lastReset || lastReset.toDateString() !== now.toDateString()) {
    entry.dailyTokensUsed = 0;
    entry.lastTokenResetAt = now;
  }
}

/**
 * Records token usage from a Gemini response's usageMetadata.
 * Called after each successful generation.
 */
function markTokenUsage(entry, usageMetadata) {
  if (!usageMetadata) return;
  const prompt = usageMetadata.promptTokenCount || 0;
  const candidates = usageMetadata.candidatesTokenCount || 0;
  const total = usageMetadata.totalTokenCount || (prompt + candidates);

  maybeResetDailyTokens(entry);

  entry.totalTokensUsed += total;
  entry.promptTokensUsed += prompt;
  entry.candidateTokensUsed += candidates;
  entry.dailyTokensUsed += total;

  persistAsync(entry.id, {
    lastTokenResetAt: entry.lastTokenResetAt,
    $inc: {
      totalTokensUsed: total,
      promptTokensUsed: prompt,
      candidateTokensUsed: candidates,
      dailyTokensUsed: total,
    },
  });
}

function markFailure(entry, error) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  const info = classify(error);
  const apiMessage = error.response?.data?.error?.message || error.message || 'Unknown error';
  entry.lastFailureAt = new Date();
  entry.totalFailures += 1;
  entry.lastErrorCode = String(error.response?.status || error.code || info.classification);
  entry.lastErrorMessage = apiMessage.slice(0, 500);

  const update = {
    lastFailureAt: entry.lastFailureAt,
    lastErrorCode: entry.lastErrorCode,
    lastErrorMessage: entry.lastErrorMessage,
    $inc: { totalFailures: 1, failureCount: 1 },
  };

  if (info.classification === 'invalid') {
    entry.status = 'invalid';
    entry.cooldownUntil = null;
    update.status = 'invalid';
    update.cooldownUntil = null;
    console.error('Gemini pool: key marked invalid', { keyId: entry.id, reason: entry.lastErrorMessage });
  } else if (info.classification === 'permanent') {
    // Not the key's fault (bad request/model) — don't punish or cool down.
  } else if (info.classification === 'capacity') {
    // A 503/high-demand response is model/provider capacity, not evidence
    // that this credential is unhealthy. Do not put the key into cooldown or
    // increment its key-level failure streak. This lets the outer model
    // fallback reuse the same key with another model instead of immediately
    // reporting an exhausted pool.
    entry.cooldownUntil = null;
    entry.status = 'healthy';
    entry.consecutiveFailures = 0;
    update.status = 'healthy';
    update.cooldownUntil = null;
    update.consecutiveFailures = 0;
  } else {
    entry.consecutiveFailures += 1;
    const cooldownMs = cooldownForFailure(entry.consecutiveFailures, info.classification, info.retryAfterMs);
    entry.cooldownUntil = cooldownMs > 0 ? new Date(Date.now() + cooldownMs) : null;
    entry.status = info.classification === 'rate_limit' ? 'rate_limited' : 'degraded';
    update.status = entry.status;
    update.cooldownUntil = entry.cooldownUntil;
    update.consecutiveFailures = entry.consecutiveFailures;
  }

  persistAsync(entry.id, update);
  return info;
}

class PoolExhaustedError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'PoolExhaustedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Runs `requestFn(rawKey)` for a given model, automatically trying another
 * key on any retryable failure. Bounds the number of distinct keys tried
 * so a fully-degraded pool fails fast instead of looping forever.
 *
 * @returns {Promise<{result: any, keyId: string}>}
 */
async function execute(requestFn) {
  await loadPool();

  if (pool.size === 0) {
    const err = new Error('No Gemini API keys are configured.');
    err.userMessage =
      'AI Studio is not configured yet. Add at least one Gemini API key from the admin panel (or set GEMINI_API_KEY).';
    err.statusCode = 500;
    throw err;
  }

  const excludeIds = [];
  const maxKeyAttempts = Math.max(1, Math.min(pool.size, 4));
  let lastError = null;
  let lastInfo = null;

  for (let attempt = 0; attempt < maxKeyAttempts; attempt += 1) {
    const entry = selectKey(excludeIds);
    if (!entry) {
      const retryAfterMs = shortestCooldownRemaining(excludeIds);
      throw new PoolExhaustedError(
        retryAfterMs
          ? `All Gemini keys are temporarily unavailable; shortest cooldown is ${Math.ceil(retryAfterMs / 1000)}s.`
          : 'No enabled, healthy Gemini API keys are available.',
        retryAfterMs
      );
    }

    markAcquired(entry);
    const startedAt = Date.now();
    try {
      const result = await requestFn(entry.rawKey);
      markSuccess(entry);
      console.log('Gemini pool request', { keyId: entry.id, attempt: attempt + 1, result: 'success', latencyMs: Date.now() - startedAt });
      return { result, keyId: entry.id };
    } catch (error) {
      const info = markFailure(entry, error);
      lastError = error;
      lastInfo = info;
      console.error('Gemini pool request', { keyId: entry.id, attempt: attempt + 1, result: 'failure', reason: info.classification, latencyMs: Date.now() - startedAt });

      if (!info.failoverKey) throw error; // permanent/bad-request — failing over won't help

      excludeIds.push(entry.id);
      const nextEntry = selectKey(excludeIds);
      console.warn('Gemini pool failover', {
        failedKeyId: entry.id,
        reason: info.classification,
        nextKeyId: nextEntry?.id || null,
      });
    }
  }

  if (lastInfo?.classification === 'invalid') throw lastError;
  throw lastError || new PoolExhaustedError('All Gemini API keys failed.', null);
}

/** Lightweight single-key test call (used by the admin "Test" button). */
async function testSingleKey(encryptedKey, requestFn) {
  const rawKey = decrypt(encryptedKey);
  try {
    await requestFn(rawKey);
    return { valid: true, message: 'Key is valid and reachable.' };
  } catch (error) {
    const info = classify(error);
    const message = error.response?.data?.error?.message || error.message;
    return {
      valid: false,
      classification: info.classification,
      errorCode: String(error.response?.status || error.code || ''),
      message,
    };
  }
}

function getSnapshot() {
  const now = Date.now();
  const keys = Array.from(pool.values()).map((e) => {
    // Auto-reset daily tokens for the snapshot if it's a new day
    maybeResetDailyTokens(e);
    return {
      id: e.id,
      label: e.label,
      persisted: e.persisted,
      enabled: e.enabled,
      priority: e.priority,
      status: e.status,
      consecutiveFailures: e.consecutiveFailures,
      cooldownRemainingMs: e.cooldownUntil ? Math.max(0, new Date(e.cooldownUntil).getTime() - now) : 0,
      cooldownUntil: e.cooldownUntil,
      inFlight: e.inFlight,
      totalRequests: e.totalRequests,
      totalSuccesses: e.totalSuccesses,
      totalFailures: e.totalFailures,
      lastUsedAt: e.lastUsedAt,
      lastErrorCode: e.lastErrorCode,
      lastErrorMessage: e.lastErrorMessage,
      // Token usage
      totalTokensUsed: e.totalTokensUsed || 0,
      promptTokensUsed: e.promptTokensUsed || 0,
      candidateTokensUsed: e.candidateTokensUsed || 0,
      dailyTokensUsed: e.dailyTokensUsed || 0,
      lastTokenResetAt: e.lastTokenResetAt,
      dailyTokenLimit: DAILY_TOKEN_LIMIT,
      isOutOfTokens: e.status === 'rate_limited' || (DAILY_TOKEN_LIMIT > 0 && (e.dailyTokensUsed || 0) >= DAILY_TOKEN_LIMIT),
    };
  });

  const activeRequests = keys.reduce((sum, k) => sum + k.inFlight, 0);
  const availableNow = keys.some((k) => k.enabled && k.status !== 'invalid' && k.status !== 'disabled' && k.cooldownRemainingMs === 0);
  const totalDailyTokens = keys.reduce((sum, k) => sum + k.dailyTokensUsed, 0);
  const outOfTokensKeys = keys.filter((k) => k.isOutOfTokens).length;

  return {
    totalKeys: keys.length,
    enabledKeys: keys.filter((k) => k.enabled).length,
    healthyKeys: keys.filter((k) => k.enabled && k.status === 'healthy').length,
    rateLimitedKeys: keys.filter((k) => k.status === 'rate_limited').length,
    invalidKeys: keys.filter((k) => k.status === 'invalid').length,
    disabledKeys: keys.filter((k) => !k.enabled).length,
    outOfTokensKeys,
    activeRequests,
    totalDailyTokens,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
    globalConcurrency: Number.parseInt(process.env.AI_CONCURRENCY || '1', 10),
    perKeyConcurrency: Number.isFinite(getPerKeyConcurrency()) ? getPerKeyConcurrency() : null,
    hasAvailableKey: availableNow,
    keys,
  };
}

module.exports = {
  loadPool,
  invalidate,
  execute,
  selectKey,
  testSingleKey,
  getSnapshot,
  markTokenUsage,
  PoolExhaustedError,
  // exported for tests only
  _internal: { pool, bootstrapFromEnv, markSuccess, markFailure, markAcquired, markTokenUsage },
};
