const mongoose = require('mongoose');
const GroqApiKey = require('./models/groqApiKey.model');
const { decrypt } = require('./utils/crypto');

/**
 * Groq API key pool used ONLY by Kashi (the DevDrop assistant). Completely
 * independent from geminiPool.service.js: separate collection, separate
 * in-memory state, separate env vars. Kashi never touches the Gemini pool.
 *
 * Selection: enabled, not cooling down, lowest priority number first, then
 * least-recently-used. On a retryable failure (429 / 5xx / timeout) the next
 * key is tried; a 401/403 marks the key invalid.
 *
 * If Mongo isn't connected or the collection is empty, falls back to
 * GROQ_API_KEY / GROQ_API_KEYS from the environment (virtual "env-" keys).
 */

const POOL_REFRESH_MS = Number.parseInt(process.env.GROQ_POOL_REFRESH_MS || '5000', 10);
const MAX_COOLDOWN_MS = Number.parseInt(process.env.GROQ_POOL_MAX_COOLDOWN_MS || '300000', 10);
const RATE_LIMIT_COOLDOWN_MS = Number.parseInt(process.env.GROQ_RATE_LIMIT_COOLDOWN_MS || '15000', 10);
const DAILY_TOKEN_LIMIT = Number.parseInt(process.env.GROQ_DAILY_TOKEN_LIMIT || '0', 10); // 0 = unlimited

/** @type {Map<string, object>} */
const pool = new Map();
let lastLoadedAt = 0;
let loadingPromise = null;
let globalRateLimitUntil = 0;

const isMongoReady = () => mongoose.connection && mongoose.connection.readyState === 1;

function newEntry(base) {
  return {
    persisted: false,
    enabled: true,
    priority: 100,
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
    totalTokensUsed: 0,
    promptTokensUsed: 0,
    candidateTokensUsed: 0,
    dailyTokensUsed: 0,
    lastTokenResetAt: null,
    ...base,
  };
}

function bootstrapFromEnv() {
  pool.clear();
  const multi = (process.env.GROQ_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  const single = (process.env.GROQ_API_KEY || '').trim();
  const rawKeys = multi.length ? multi : single && single !== 'your_groq_api_key_here' ? [single] : [];
  rawKeys.forEach((rawKey, index) => {
    const id = `env-${index}`;
    pool.set(id, newEntry({
      id,
      rawKey,
      priority: 0,
      label: rawKeys.length > 1 ? `Env key ${index + 1}` : 'Default (GROQ_API_KEY)',
    }));
  });
}

async function loadFromDB() {
  const docs = await GroqApiKey.find().select('+encryptedKey');
  const seen = new Set();
  for (const doc of docs) {
    const id = String(doc._id);
    seen.add(id);
    let rawKey;
    try {
      rawKey = decrypt(doc.encryptedKey);
    } catch (error) {
      console.error(`Groq pool: failed to decrypt key ${id}, skipping`, error.message);
      continue;
    }
    const prev = pool.get(id);
    pool.set(id, newEntry({
      id,
      persisted: true,
      label: doc.label,
      rawKey,
      enabled: doc.enabled,
      priority: doc.priority,
      status: prev?.status ?? doc.status,
      consecutiveFailures: prev?.consecutiveFailures ?? doc.consecutiveFailures ?? 0,
      cooldownUntil: prev?.cooldownUntil ?? doc.cooldownUntil ?? null,
      lastUsedAt: prev?.lastUsedAt ?? doc.lastUsedAt ?? null,
      lastSuccessAt: prev?.lastSuccessAt ?? doc.lastSuccessAt ?? null,
      lastFailureAt: prev?.lastFailureAt ?? doc.lastFailureAt ?? null,
      lastErrorCode: prev?.lastErrorCode ?? doc.lastErrorCode ?? null,
      lastErrorMessage: prev?.lastErrorMessage ?? doc.lastErrorMessage ?? null,
      totalRequests: prev?.totalRequests ?? doc.totalRequests ?? 0,
      totalSuccesses: prev?.totalSuccesses ?? doc.totalSuccesses ?? 0,
      totalFailures: prev?.totalFailures ?? doc.totalFailures ?? 0,
      inFlight: prev?.inFlight ?? 0,
      totalTokensUsed: prev?.totalTokensUsed ?? doc.totalTokensUsed ?? 0,
      promptTokensUsed: prev?.promptTokensUsed ?? doc.promptTokensUsed ?? 0,
      candidateTokensUsed: prev?.candidateTokensUsed ?? doc.candidateTokensUsed ?? 0,
      dailyTokensUsed: prev?.dailyTokensUsed ?? doc.dailyTokensUsed ?? 0,
      lastTokenResetAt: prev?.lastTokenResetAt ?? doc.lastTokenResetAt ?? null,
    }));
  }
  for (const id of Array.from(pool.keys())) {
    if (!id.startsWith('env-') && !seen.has(id)) pool.delete(id);
  }
}

async function loadPool(force = false) {
  if (!force && Date.now() - lastLoadedAt <= POOL_REFRESH_MS) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      if (isMongoReady()) {
        const count = await GroqApiKey.estimatedDocumentCount();
        if (count > 0) await loadFromDB();
        else if (pool.size === 0) bootstrapFromEnv();
      } else if (pool.size === 0) {
        bootstrapFromEnv();
      }
      lastLoadedAt = Date.now();
    } catch (error) {
      console.error('Groq pool: failed to load pool config', error.message);
      if (pool.size === 0) bootstrapFromEnv();
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

const invalidate = () => { lastLoadedAt = 0; };

function persistAsync(id, update) {
  if (id.startsWith('env-') || !isMongoReady()) return;
  GroqApiKey.findByIdAndUpdate(id, update).catch((error) => {
    console.error(`Groq pool: failed to persist state for key ${id}`, error.message);
  });
}

function maybeResetDailyTokens(entry) {
  const now = new Date();
  const last = entry.lastTokenResetAt ? new Date(entry.lastTokenResetAt) : null;
  if (!last || last.toDateString() !== now.toDateString()) {
    entry.dailyTokensUsed = 0;
    entry.lastTokenResetAt = now;
  }
}

function isOverDailyLimit(entry) {
  if (!(DAILY_TOKEN_LIMIT > 0)) return false;
  maybeResetDailyTokens(entry);
  return entry.dailyTokensUsed >= DAILY_TOKEN_LIMIT;
}

function isUsable(entry, excludeIds, now) {
  if (!entry.enabled) return false;
  if (entry.status === 'invalid' || entry.status === 'disabled') return false;
  if (excludeIds.includes(entry.id)) return false;
  if (entry.cooldownUntil && new Date(entry.cooldownUntil).getTime() > now) return false;
  if (isOverDailyLimit(entry)) return false;
  return true;
}

function selectKey(excludeIds = []) {
  const now = Date.now();
  const candidates = Array.from(pool.values()).filter((e) => isUsable(e, excludeIds, now));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aLast = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bLast = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return aLast - bLast;
  });
  return candidates[0];
}

/** Groq failure classification (HTTP semantics are OpenAI-compatible). */
function parseDurationMs(value) {
  if (value == null) return 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw) * 1000;
  let total = 0;
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let match;
  while ((match = re.exec(raw))) {
    const n = Number(match[1]);
    if (match[2] === 'ms') total += n;
    else if (match[2] === 's') total += n * 1000;
    else if (match[2] === 'm') total += n * 60000;
    else if (match[2] === 'h') total += n * 3600000;
  }
  return total;
}

function rateLimitWaitMs(error) {
  const headers = error?.response?.headers || {};
  const retryAfter = parseDurationMs(headers['retry-after']);
  const tokenReset = parseDurationMs(headers['x-ratelimit-reset-tokens']);
  const requestReset = parseDurationMs(headers['x-ratelimit-reset-requests']);
  return Math.max(retryAfter, tokenReset, requestReset);
}

function classify(error) {
  const status = error?.response?.status;
  const code = error?.code;
  const retryAfterMs = rateLimitWaitMs(error);
  if (status === 401 || status === 403) return { classification: 'invalid', failoverKey: true, retryAfterMs: 0 };
  if (status === 429) return { classification: 'rate_limit', failoverKey: true, retryAfterMs };
  if (status >= 500 || ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(code)) {
    return { classification: 'transient', failoverKey: true, retryAfterMs };
  }
  // 400 / 404 / 413 / 422: the request or model is wrong, another key won't help.
  return { classification: 'permanent', failoverKey: false, retryAfterMs: 0 };
}

function cooldownFor(streak, info) {
  if (info.retryAfterMs > 0) return Math.min(info.retryAfterMs, MAX_COOLDOWN_MS);
  const base = info.classification === 'rate_limit' ? RATE_LIMIT_COOLDOWN_MS : 3000;
  return Math.min(base * 2 ** Math.max(0, streak - 1), MAX_COOLDOWN_MS);
}

function markAcquired(entry) {
  entry.inFlight += 1;
  entry.lastUsedAt = new Date();
  entry.totalRequests += 1;
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

function markTokenUsage(entry, usage) {
  if (!usage) return null;
  const prompt = Number(usage.prompt_tokens) || 0;
  const completion = Number(usage.completion_tokens) || 0;
  const total = Number(usage.total_tokens) || prompt + completion;
  maybeResetDailyTokens(entry);
  entry.totalTokensUsed += total;
  entry.promptTokensUsed += prompt;
  entry.candidateTokensUsed += completion;
  entry.dailyTokensUsed += total;
  persistAsync(entry.id, {
    lastTokenResetAt: entry.lastTokenResetAt,
    $inc: { totalTokensUsed: total, promptTokensUsed: prompt, candidateTokensUsed: completion, dailyTokensUsed: total },
  });
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

function markFailure(entry, error) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  const info = classify(error);
  const apiMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error';
  entry.lastFailureAt = new Date();
  entry.totalFailures += 1;
  entry.lastErrorCode = String(error?.response?.status || error?.code || info.classification);
  entry.lastErrorMessage = String(apiMessage).slice(0, 500);

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
    console.error('Groq pool: key marked invalid', { keyId: entry.id });
  } else if (info.classification === 'permanent') {
    entry.status = 'healthy';
    update.status = 'healthy';
  } else {
    entry.consecutiveFailures += 1;
    entry.cooldownUntil = new Date(Date.now() + cooldownFor(entry.consecutiveFailures, info));
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
    this.code = 'GROQ_POOL_EXHAUSTED';
    this.retryAfterMs = retryAfterMs;
  }
}

function shortestCooldownRemaining(excludeIds = []) {
  const now = Date.now();
  const waits = Array.from(pool.values())
    .filter((e) => e.enabled && e.status !== 'invalid' && e.status !== 'disabled' && !excludeIds.includes(e.id))
    .map((e) => (e.cooldownUntil ? new Date(e.cooldownUntil).getTime() - now : 0))
    .filter((ms) => ms > 0);
  return waits.length ? Math.min(...waits) : null;
}

/**
 * Runs `requestFn(rawKey)` on the best key, failing over to the next key on
 * any retryable error. `requestFn` must resolve with an object that may carry
 * `usage` ({prompt_tokens, completion_tokens, total_tokens}).
 *
 * @returns {Promise<{result: any, keyId: string}>}
 */
async function execute(requestFn) {
  await loadPool();
  if (globalRateLimitUntil > Date.now()) {
    const retryAfterMs = globalRateLimitUntil - Date.now();
    throw new PoolExhaustedError(
      `Groq organization rate limit is active; retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
      retryAfterMs
    );
  }
  if (pool.size === 0) {
    const err = new Error('No Groq API keys are configured.');
    err.userMessage = 'Kashi is not configured yet. Add a Groq API key from Admin Panel -> Groq Pool (or set GROQ_API_KEY).';
    err.statusCode = 503;
    throw err;
  }

  const excludeIds = [];
  const maxAttempts = Math.max(1, pool.size);
  let lastError = null;
  let lastInfo = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const entry = selectKey(excludeIds);
    if (!entry) {
      const retryAfterMs = shortestCooldownRemaining(excludeIds);
      throw new PoolExhaustedError(
        retryAfterMs
          ? `All Groq keys are cooling down; shortest wait is ${Math.ceil(retryAfterMs / 1000)}s.`
          : 'No enabled, healthy Groq API keys are available.',
        retryAfterMs
      );
    }

    markAcquired(entry);
    const startedAt = Date.now();
    try {
      const result = await requestFn(entry.rawKey);
      markTokenUsage(entry, result?.usage || result?.data?.usage);
      markSuccess(entry);
      console.log('[Groq Pool] SUCCESS', { key: entry.label, keyId: entry.id, latencyMs: Date.now() - startedAt });
      return { result, keyId: entry.id };
    } catch (error) {
      const info = markFailure(entry, error);
      lastError = error;
      lastInfo = info;
      console.warn('[Groq Pool] FAILED', { key: entry.label, keyId: entry.id, reason: info.classification, status: error?.response?.status || null });
      if (info.classification === 'rate_limit') {
        const waitMs = Math.min(info.retryAfterMs || RATE_LIMIT_COOLDOWN_MS, MAX_COOLDOWN_MS);
        globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + waitMs);
        throw new PoolExhaustedError(
          `Groq organization rate limit reached; retry in ${Math.ceil(waitMs / 1000)}s.`,
          waitMs
        );
      }
      if (!info.failoverKey) throw error;
      excludeIds.push(entry.id);
    }
  }

  if (lastInfo?.classification === 'invalid') throw lastError;
  throw new PoolExhaustedError(
    `Groq pool exhausted after trying ${excludeIds.length} key(s).`,
    lastInfo?.retryAfterMs || null
  );
}

/** Single-key test call (admin "Test" button). */
async function testSingleKey(encryptedKey, requestFn) {
  const rawKey = decrypt(encryptedKey);
  try {
    await requestFn(rawKey);
    return { classification: 'success', message: 'Key is valid and reachable.' };
  } catch (error) {
    const info = classify(error);
    return {
      classification: info.classification === 'rate_limit' ? 'rate_limit' : info.classification,
      status: error?.response?.status || null,
      message: error?.response?.data?.error?.message || error.message,
    };
  }
}

function getSnapshot() {
  const now = Date.now();
  const keys = Array.from(pool.values()).map((e) => {
    maybeResetDailyTokens(e);
    return {
      id: e.id,
      label: e.label,
      maskedKey: undefined,
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
      totalTokensUsed: e.totalTokensUsed || 0,
      promptTokensUsed: e.promptTokensUsed || 0,
      candidateTokensUsed: e.candidateTokensUsed || 0,
      dailyTokensUsed: e.dailyTokensUsed || 0,
      lastTokenResetAt: e.lastTokenResetAt,
      dailyTokenLimit: DAILY_TOKEN_LIMIT,
      isOutOfTokens: e.status === 'rate_limited' || isOverDailyLimit(e),
    };
  });
  return {
    totalKeys: keys.length,
    enabledKeys: keys.filter((k) => k.enabled).length,
    healthyKeys: keys.filter((k) => k.enabled && k.status === 'healthy').length,
    rateLimitedKeys: keys.filter((k) => k.status === 'rate_limited').length,
    invalidKeys: keys.filter((k) => k.status === 'invalid').length,
    disabledKeys: keys.filter((k) => !k.enabled).length,
    outOfTokensKeys: keys.filter((k) => k.isOutOfTokens).length,
    activeRequests: keys.reduce((s, k) => s + k.inFlight, 0),
    totalDailyTokens: keys.reduce((s, k) => s + k.dailyTokensUsed, 0),
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
    globalRateLimitRemainingMs: Math.max(0, globalRateLimitUntil - now),
    hasAvailableKey: globalRateLimitUntil <= now && keys.some((k) => k.enabled && !['invalid', 'disabled'].includes(k.status) && k.cooldownRemainingMs === 0),
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
  PoolExhaustedError,
  _internal: {
    pool,
    bootstrapFromEnv,
    markSuccess,
    markFailure,
    markAcquired,
    classify,
    parseDurationMs,
    rateLimitWaitMs,
    getGlobalRateLimitUntil: () => globalRateLimitUntil,
    resetGlobalRateLimit: () => { globalRateLimitUntil = 0; },
  },
};
