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
// Number of different credentials a single Gemini call may try before the
// pool gives control back to the LLM layer.  The old hard-coded value of 4
// made a 57-project pool behave like a 4-key pool and caused the outer LLM
// retry loop to start the same failover cycle again.
function getMaxKeyAttempts() {
  const raw = Number.parseInt(process.env.GEMINI_POOL_MAX_KEY_ATTEMPTS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : pool.size || 1;
}
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
      modelCooldowns: {},
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
function normalizeModelCooldowns(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (typeof value === 'object') return { ...value };
  return {};
}

function modelCooldownRemaining(entry, model) {
  const until = entry?.modelCooldowns?.[model];
  if (!until) return 0;
  return Math.max(0, new Date(until).getTime() - Date.now());
}

function clearExpiredModelCooldowns(entry) {
  if (!entry?.modelCooldowns) return;
  for (const [model, until] of Object.entries(entry.modelCooldowns)) {
    if (new Date(until).getTime() <= Date.now()) delete entry.modelCooldowns[model];
  }
}

function setModelCooldown(entry, model, cooldownMs) {
  if (!entry.modelCooldowns) entry.modelCooldowns = {};
  if (cooldownMs > 0) entry.modelCooldowns[model] = new Date(Date.now() + cooldownMs);
  else delete entry.modelCooldowns[model];
  persistAsync(entry.id, { modelCooldowns: entry.modelCooldowns });
}

function setModelCooldownUntil(entry, model, untilMs) {
  if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
    setModelCooldown(entry, model, 0);
    return;
  }
  if (!entry.modelCooldowns) entry.modelCooldowns = {};
  entry.modelCooldowns[model] = new Date(untilMs);
  persistAsync(entry.id, { modelCooldowns: entry.modelCooldowns });
}

function getNextModelCooldown(entry, models) {
  clearExpiredModelCooldowns(entry);
  const items = (models || [])
    .map((model) => ({ model, remainingMs: modelCooldownRemaining(entry, model) }))
    .filter((x) => x.remainingMs > 0)
    .sort((a, b) => a.remainingMs - b.remainingMs);
  return items[0] || null;
}

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
      modelCooldowns: existing?.modelCooldowns ?? normalizeModelCooldowns(doc.modelCooldowns),
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
function keyLogName(entry) {
  const suffix = entry?.id ? String(entry.id).slice(-6) : 'unknown';
  return entry?.label ? `${entry.label} (${suffix})` : `key-${suffix}`;
}

function logModelTry(entry, model, meta = {}) {
  console.log('[Gemini Pool] TRY', {
    key: keyLogName(entry),
    keyId: entry?.id || null,
    model,
    ...meta,
  });
}

function logModelResult(entry, model, result, meta = {}) {
  const method = result === 'SUCCESS' ? console.log : console.warn;
  method(`[Gemini Pool] ${result}`, {
    key: keyLogName(entry),
    keyId: entry?.id || null,
    model,
    ...meta,
  });
}

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

function shortestCooldownRemaining(excludeIds = [], models = []) {
  const now = Date.now();
  const relevant = Array.from(pool.values()).filter(
    (e) => e.enabled && e.status !== 'invalid' && e.status !== 'disabled' && !excludeIds.includes(e.id)
  );
  const cooldowns = [];

  for (const e of relevant) {
    if (e.cooldownUntil) {
      const ms = new Date(e.cooldownUntil).getTime() - now;
      if (ms > 0) cooldowns.push(ms);
    }
    for (const model of models) {
      const ms = modelCooldownRemaining(e, model);
      if (ms > 0) cooldowns.push(ms);
    }
  }

  return cooldowns.length ? Math.min(...cooldowns) : null;
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

function markSuccess(entry, model = null) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
  entry.consecutiveFailures = 0;
  if (model && entry.modelCooldowns?.[model]) {
    delete entry.modelCooldowns[model];
    persistAsync(entry.id, { $unset: { [`modelCooldowns.${model}`]: 1 } });
  }
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

  const prompt = Number(usageMetadata.promptTokenCount) || 0;
  const candidates = Number(usageMetadata.candidatesTokenCount) || 0;
  const total = Number(usageMetadata.totalTokenCount) || (prompt + candidates);

  // A successful Gemini HTTP response can still later fail JSON/schema
  // validation. Token usage is nevertheless billable/consumed, so account
  // for it at the pool boundary before the caller parses the generated text.
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

function recordTokenUsageFromResult(entry, result, model) {
  // The pool receives different result shapes depending on the caller.
  // Website generation currently returns { response, parsed }, where the
  // Axios response is nested under `response`. Support all known shapes so
  // token accounting does not silently miss successful generations.
  const usageMetadata =
    result?.data?.usageMetadata ||
    result?.usageMetadata ||
    result?.response?.data?.usageMetadata ||
    result?.response?.usageMetadata ||
    result?.raw?.data?.usageMetadata ||
    result?.raw?.usageMetadata ||
    null;

  if (!usageMetadata) {
    console.warn('[Gemini Pool] SUCCESS WITHOUT TOKEN METADATA', {
      keyId: entry.id,
      model,
      resultShape: {
        hasData: Boolean(result?.data),
        hasUsageMetadata: Boolean(result?.usageMetadata),
        hasResponse: Boolean(result?.response),
        hasResponseData: Boolean(result?.response?.data),
        hasParsed: Boolean(result?.parsed),
      },
    });
    return null;
  }

  markTokenUsage(entry, usageMetadata);

  const usage = {
    promptTokens: Number(usageMetadata.promptTokenCount) || 0,
    candidateTokens: Number(usageMetadata.candidatesTokenCount) || 0,
    totalTokens:
      Number(usageMetadata.totalTokenCount) ||
      ((Number(usageMetadata.promptTokenCount) || 0) +
        (Number(usageMetadata.candidatesTokenCount) || 0)),
  };

  console.log('[Gemini Pool] TOKEN USAGE', {
    keyId: entry.id,
    model,
    ...usage,
  });

  return usage;
}

function markFailure(entry, error, options = {}) {
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
    // Bad request / unsupported model. Do not punish the credential.
    entry.status = 'healthy';
    update.status = 'healthy';
  } else {
    // For model-sequence requests, a model failure is NOT a key failure.
    // The credential becomes unavailable only after every configured model
    // has failed for that same key. executeModels() applies the key-level
    // cooldown once the complete model sequence is exhausted.
    if (!options.model) {
      entry.consecutiveFailures += 1;

      const exactQuotaResetAt = Number(info.quotaResetAt) || 0;
      if (exactQuotaResetAt > Date.now()) {
        entry.cooldownUntil = new Date(exactQuotaResetAt);
      } else {
        const cooldownMs = Math.max(
          1_000,
          cooldownForFailure(entry.consecutiveFailures, info.classification, info.retryAfterMs)
        );
        entry.cooldownUntil = new Date(Date.now() + cooldownMs);
      }

      entry.status = info.classification === 'rate_limit' || info.classification === 'quota_exceeded'
        ? 'rate_limited'
        : 'degraded';
      update.status = entry.status;
      update.cooldownUntil = entry.cooldownUntil;
      update.consecutiveFailures = entry.consecutiveFailures;
    } else {
      // Keep the key itself available while the caller walks the models.
      // Do not create a per-model cooldown. Model fallback must remain:
      //   key -> model1 -> model2 -> model3 -> model4 -> next key
      entry.cooldownUntil = null;
      entry.status = info.classification === 'rate_limit' || info.classification === 'quota_exceeded'
        ? 'rate_limited'
        : 'degraded';
      update.status = entry.status;
      update.cooldownUntil = null;
    }
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
 * Runs a model sequence on the SAME credential before moving to the next
 * credential. This is the important traversal order for website generation:
 *
 *   key A -> model 1 -> model 2 -> model 3 -> model 4
 *          -> key B -> model 1 -> model 2 -> ...
 *
 * A retryable provider failure (429/503/timeout/transient) moves to the next
 * model while keeping the current key. Only after every model has failed for
 * that key do we move to another credential.
 *
 * `requestFn(rawKey, model)` must resolve with the provider result or reject
 * with the provider error.
 *
 * @returns {Promise<{result: any, keyId: string, model: string}>}
 */
async function executeModels(models, requestFn) {
  await loadPool();

  const modelList = Array.isArray(models) ? models.filter(Boolean) : [];
  if (modelList.length === 0) {
    const err = new Error('No Gemini models are configured.');
    err.code = 'GEMINI_NO_MODELS';
    throw err;
  }

  if (pool.size === 0) {
    const err = new Error('No Gemini API keys are configured.');
    err.userMessage =
      'AI Studio is not configured yet. Add at least one Gemini API key from the admin panel (or set GEMINI_API_KEY).';
    err.statusCode = 500;
    throw err;
  }

  const excludeIds = [];
  const maxKeyAttempts = Math.max(1, Math.min(pool.size, getMaxKeyAttempts()));
  let lastError = null;
  let lastInfo = null;

  for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt += 1) {
    const entry = selectKey(excludeIds);
    if (!entry) {
      const retryAfterMs = shortestCooldownRemaining(excludeIds, modelList);
      throw new PoolExhaustedError(
        retryAfterMs
          ? `All Gemini keys are temporarily unavailable; shortest cooldown is ${Math.ceil(retryAfterMs / 1000)}s.`
          : 'No enabled, healthy Gemini API keys are available.',
        retryAfterMs
      );
    }

    entry._currentSequenceFailures = [];

    console.log('Gemini pool key sequence start', {
      keyId: entry.id,
      keyAttempt: keyAttempt + 1,
      models: modelList,
    });

    for (let modelAttempt = 0; modelAttempt < modelList.length; modelAttempt += 1) {
      const model = modelList[modelAttempt];
      const modelCooldownMs = modelCooldownRemaining(entry, model);
      if (modelCooldownMs > 0) {
        console.log('[Gemini Pool] SKIP COOLDOWN', {
          keyId: entry.id,
          model,
          remainingMs: modelCooldownMs,
          remaining: `${Math.ceil(modelCooldownMs / 1000)}s`,
        });
        continue;
      }
      markAcquired(entry);
      const startedAt = Date.now();

      logModelTry(entry, model, {
        keyAttempt: keyAttempt + 1,
        modelAttempt: modelAttempt + 1,
        totalKeys: maxKeyAttempts,
        totalModels: modelList.length,
      });

      try {
        const result = await requestFn(entry.rawKey, model);
        // Count tokens for every successful provider response at the pool
        // boundary. This covers all callers, including the agent service,
        // and ensures malformed generated JSON is still accounted for.
        recordTokenUsageFromResult(entry, result, model);
        markSuccess(entry, model);
        delete entry._currentSequenceFailures;
        logModelResult(entry, model, 'SUCCESS', {
          keyAttempt: keyAttempt + 1,
          modelAttempt: modelAttempt + 1,
          latencyMs: Date.now() - startedAt,
        });
        return { result, keyId: entry.id, model };
      } catch (error) {
        const info = markFailure(entry, error, { model, deferTemporaryCooldown: modelAttempt < modelList.length - 1 });
        entry._currentSequenceFailures.push(info);
        lastError = error;
        lastInfo = info;

        logModelResult(entry, model, 'FAILED', {
          keyAttempt: keyAttempt + 1,
          modelAttempt: modelAttempt + 1,
          reason: info.classification,
          status: error?.response?.status || null,
          latencyMs: Date.now() - startedAt,
        });

        if (info.classification === 'timeout') {
          console.warn('[Gemini Pool] TIMEOUT -> falling back immediately', {
            keyId: entry.id,
            model,
            timeoutMs: Date.now() - startedAt,
            nextModel: modelList[modelAttempt + 1] || null,
          });
        }

        if (!info.failoverKey) throw error;

        // Same key, next model first. Do not immediately cool a credential
        // while we are still walking the model list. A 429 may be model- or
        // dimension-specific, and the caller explicitly wants model fallback
        // before credential fallback.
        if (modelAttempt < modelList.length - 1) {
          console.log('[Gemini Pool] NEXT MODEL ON SAME KEY', {
            keyId: entry.id,
            failedModel: model,
            reason: info.classification,
            nextModel: modelList[modelAttempt + 1],
          });
          continue;
        }

        // Every configured model failed on this credential. Only NOW do we
        // put the entire API key into cooldown. Any exact quota reset returned
        // by Gemini wins over the generic exponential cooldown.
        const keyFailureStreak = Math.max(1, entry.consecutiveFailures + 1);
        const sequenceInfos = Array.isArray(entry._currentSequenceFailures)
          ? entry._currentSequenceFailures
          : [];
        const resetTimes = sequenceInfos
          .map((failureInfo) => Number(failureInfo?.quotaResetAt) || 0)
          .filter((resetAt) => resetAt > Date.now());
        const exactQuotaResetAt = resetTimes.length ? Math.max(...resetTimes) : 0;

        let keyCooldownUntil = exactQuotaResetAt;
        if (!keyCooldownUntil) {
          const suggestedCooldowns = sequenceInfos.map((failureInfo) =>
            Math.max(
              1_000,
              cooldownForFailure(
                keyFailureStreak,
                failureInfo?.classification || 'unknown',
                Number(failureInfo?.retryAfterMs) || 0
              )
            )
          );
          const fallbackCooldown = Math.max(
            1_000,
            cooldownForFailure(
              keyFailureStreak,
              info.classification,
              Number(info.retryAfterMs) || 0
            )
          );
          const cooldownMs = Math.max(fallbackCooldown, ...suggestedCooldowns, 0);
          keyCooldownUntil = Date.now() + cooldownMs;
        }

        entry.consecutiveFailures = keyFailureStreak;
        entry.cooldownUntil = new Date(keyCooldownUntil);
        entry.status = info.classification === 'rate_limit' || info.classification === 'quota_exceeded'
          ? 'rate_limited'
          : 'degraded';
        // No per-model cooldown survives a complete key failure. The key is
        // cooled as one unit and all of its models become eligible together.
        entry.modelCooldowns = {};
        persistAsync(entry.id, {
          status: entry.status,
          cooldownUntil: entry.cooldownUntil,
          consecutiveFailures: entry.consecutiveFailures,
          modelCooldowns: {},
        });

        console.warn('[Gemini Pool] KEY COOLDOWN - ALL MODELS FAILED', {
          keyId: entry.id,
          failedModels: modelList,
          cooldownUntil: entry.cooldownUntil.toISOString(),
          remainingMs: Math.max(0, keyCooldownUntil - Date.now()),
          quotaReset: Boolean(exactQuotaResetAt),
        });

        // This key is now excluded at the credential level for the remainder
        // of the current execution as well as future requests until cooldown.
        excludeIds.push(entry.id);
        const nextEntry = selectKey(excludeIds);
        delete entry._currentSequenceFailures;
        console.log('[Gemini Pool] NEXT KEY', {
          failedKeyId: entry.id,
          reason: info.classification,
          nextKeyId: nextEntry?.id || null,
        });
      }
    }
  }

  if (lastInfo?.classification === 'invalid') throw lastError;
  const exhausted = new PoolExhaustedError(
    lastInfo?.quotaResetAt && lastInfo.quotaResetAt > Date.now()
      ? `Gemini pool exhausted; quota refreshes at ${new Date(lastInfo.quotaResetAt).toISOString()}.`
      : lastInfo?.retryAfterMs
        ? `Gemini pool exhausted after trying ${excludeIds.length} credentials across ${modelList.length} models each; retry after ${Math.ceil(lastInfo.retryAfterMs / 1000)}s.`
        : `Gemini pool exhausted after trying ${excludeIds.length} credentials across ${modelList.length} models each.`,
    lastInfo?.quotaResetAt && lastInfo.quotaResetAt > Date.now()
      ? lastInfo.quotaResetAt - Date.now()
      : (lastInfo?.retryAfterMs || null)
  );
  exhausted.code = 'GEMINI_POOL_EXHAUSTED';
  exhausted.classification = lastInfo?.classification || 'unknown';
  exhausted.attemptedKeyIds = excludeIds.slice();
  exhausted.lastError = lastError;
  throw exhausted;
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
  const maxKeyAttempts = Math.max(1, Math.min(pool.size, getMaxKeyAttempts()));
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
      recordTokenUsageFromResult(entry, result, undefined);
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
  const exhausted = new PoolExhaustedError(
    lastInfo?.retryAfterMs
      ? `Gemini pool exhausted after trying ${excludeIds.length} credentials; retry after ${Math.ceil(lastInfo.retryAfterMs / 1000)}s.`
      : `Gemini pool exhausted after trying ${excludeIds.length} credentials.`,
    lastInfo?.retryAfterMs || null
  );
  exhausted.code = 'GEMINI_POOL_EXHAUSTED';
  exhausted.classification = lastInfo?.classification || 'unknown';
  exhausted.attemptedKeyIds = excludeIds.slice();
  exhausted.lastError = lastError;
  throw exhausted;
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

function modelListForSnapshot() {
  const raw = process.env.GEMINI_MODELS || 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite';
  return raw.split(',').map((m) => m.trim()).filter(Boolean);
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
      modelCooldowns: Object.fromEntries(
        Object.entries(e.modelCooldowns || {})
          .filter(([, until]) => new Date(until).getTime() > now)
          .map(([model, until]) => [model, new Date(until).toISOString()])
      ),
      activeModelCooldown: getNextModelCooldown(e, modelListForSnapshot()),
      isOutOfTokens: e.status === 'rate_limited' || (DAILY_TOKEN_LIMIT > 0 && (e.dailyTokensUsed || 0) >= DAILY_TOKEN_LIMIT),
    };
  });

  const snapshotModels = modelListForSnapshot();
  const activeRequests = keys.reduce((sum, k) => sum + k.inFlight, 0);
  const availableNow = keys.some((k) => {
    if (!k.enabled || k.status === 'invalid' || k.status === 'disabled') return false;
    if (k.cooldownRemainingMs > 0) return false;
    return snapshotModels.some((model) => {
      const until = k.modelCooldowns?.[model];
      return !until || new Date(until).getTime() <= now;
    });
  });
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
  executeModels,
  selectKey,
  testSingleKey,
  getSnapshot,
  markTokenUsage,
  PoolExhaustedError,
  // exported for tests only
  _internal: { pool, bootstrapFromEnv, markSuccess, markFailure, markAcquired, markTokenUsage },
};
