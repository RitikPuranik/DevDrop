const crypto = require('crypto');
const mongoose = require('mongoose');
const GeminiApiKey = require('./models/geminiApiKey.model');
const GeminiPoolState = require('./models/geminiPoolState.model');
const { decrypt } = require('./utils/crypto');
const { classify, cooldownMsFor, envMs } = require('./geminiFailureClassifier');
const { getJobContext } = require('./utils/jobContext');

/**
 * Maintains a pool of Gemini credentials (Google Cloud projects) and wraps a
 * "make one Gemini request for this model" function with project selection
 * and automatic failover.
 *
 * Availability is tracked per project AND per model:
 *   - entry.cooldownUntil         project-wide quota (only when the provider's
 *                                 quota is clearly not model-scoped)
 *   - entry.modelCooldowns[model] per-project-per-model quota (RPM/TPM/RPD)
 *   - globalModelCooldowns[model] shared model capacity (503/overloaded) —
 *                                 independent of any project's quota
 * A cooldown on project A never affects project B. Keys that report the same
 * Google Cloud project (projectId) share project/model cooldowns, and
 * identical credentials are de-duplicated for quota accounting.
 *
 * Failover happens INSIDE one executeModels() call: a project-specific rate
 * limit marks that project/model unavailable and the very next attempt goes to
 * another eligible project, without waiting for any cooldown. When nothing is
 * eligible the call throws PoolExhaustedError carrying a structured result
 * (reason, attempted projects, failure categories, earliest retry time,
 * whether retrying is sensible); callers decide how to wait.
 *
 * Shared state: cooldowns are written to Mongo with atomic $max operations and
 * re-read (throttled, GEMINI_POOL_STATE_SYNC_MS) before every attempt so that
 * several workers/instances stop hammering the same exhausted project.
 *
 * Backwards compatibility: if Mongo isn't connected, or the collection is
 * empty, falls back to GEMINI_API_KEY (single key) or GEMINI_API_KEYS
 * (comma-separated). Those bootstrap entries are virtual (id "env-N") and are
 * never persisted.
 */

const POOL_REFRESH_MS = envMs('GEMINI_POOL_REFRESH_MS', 5000);
const DAILY_TOKEN_LIMIT = Number.parseInt(process.env.GEMINI_DAILY_TOKEN_LIMIT || '1500000', 10);

// Max distinct projects a single request may try (default: all of them).
function getMaxKeyAttempts() {
  const raw = Number.parseInt(process.env.GEMINI_POOL_MAX_KEY_ATTEMPTS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : pool.size || 1;
}
function getPerKeyConcurrency() {
  const raw = Number.parseInt(process.env.GEMINI_PER_KEY_CONCURRENCY || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : Infinity;
}
// Wall-clock bound for one failover cycle (default 0 = none: keep trying every
// eligible key until one answers or all are exhausted). Each HTTP attempt is
// additionally bounded by the caller's axios timeout.
const getRequestDeadlineMs = () => envMs('GEMINI_POOL_REQUEST_DEADLINE_MS', 0);
// Unusable-JSON (HTTP 200) answers tried across projects before giving up.
const getMaxBadOutputAttempts = () => Math.max(1, envMs('GEMINI_POOL_MAX_BAD_OUTPUT_ATTEMPTS', 10));
const getStateSyncMs = () => envMs('GEMINI_POOL_STATE_SYNC_MS', 1000);

/** @type {Map<string, object>} keyId -> runtime+config state */
const pool = new Map();

// Shared model-capacity cooldowns: modelKey -> until (epoch ms). Mirrored to
// Mongo (GeminiPoolState) so every worker avoids an overloaded model.
const globalModelCooldowns = new Map();

let lastLoadedAt = 0;
let loadingPromise = null;
let lastSyncAt = 0;
let syncPromise = null;

function isMongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

// ---------------------------------------------------------------- helpers --

// Mongoose maps (and Mongo update paths) cannot contain '.', but model names do.
const mk = (model) => String(model).replace(/[.$]/g, '_');
const ts = (value) => (value ? new Date(value).getTime() || 0 : 0);
const groupOf = (entry) => (entry.projectKey ? `p:${entry.projectKey}` : `k:${entry.id}`);

function keyLogName(entry) {
  const suffix = entry?.id ? String(entry.id).slice(-6) : 'unknown';
  return entry?.label ? `${entry.label} (${suffix})` : `key-${suffix}`;
}

/** Structured log line. Never pass credentials or prompts into `fields`. */
function plog(level, event, fields = {}) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[Gemini Pool] ${event}`, { jobId: getJobContext().jobId || null, ...fields });
}

function persistAsync(id, update) {
  if (String(id).startsWith('env-')) return; // virtual bootstrap key, nothing to persist
  if (!isMongoReady()) return;
  Promise.resolve(GeminiApiKey.findByIdAndUpdate(id, update)).catch((error) => {
    console.error(`Gemini pool: failed to persist state for key ${id}`, error.message);
  });
}

function newEntryState(id, persisted, base) {
  return {
    id,
    persisted,
    label: base.label,
    rawKey: base.rawKey,
    fingerprint: crypto.createHash('sha256').update(base.rawKey).digest('hex'),
    enabled: base.enabled,
    priority: base.priority,
    projectKey: base.projectKey || null,
    duplicateOf: null,
    status: base.status || 'healthy',
    consecutiveFailures: base.consecutiveFailures || 0,
    cooldownUntil: base.cooldownUntil || null,
    lastUsedAt: base.lastUsedAt || null,
    lastSuccessAt: base.lastSuccessAt || null,
    lastFailureAt: base.lastFailureAt || null,
    lastErrorCode: base.lastErrorCode || null,
    lastErrorMessage: base.lastErrorMessage || null,
    totalRequests: base.totalRequests || 0,
    totalSuccesses: base.totalSuccesses || 0,
    totalFailures: base.totalFailures || 0,
    inFlight: base.inFlight || 0,
    totalTokensUsed: base.totalTokensUsed || 0,
    promptTokensUsed: base.promptTokensUsed || 0,
    candidateTokensUsed: base.candidateTokensUsed || 0,
    dailyTokensUsed: base.dailyTokensUsed || 0,
    lastTokenResetAt: base.lastTokenResetAt || null,
    modelCooldowns: base.modelCooldowns || {},
    failureStreaks: base.failureStreaks || {},
    invalidAt: base.invalidAt || 0,
  };
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
    pool.set(id, newEntryState(id, false, {
      label: rawKeys.length > 1 ? `Env key ${index + 1}` : 'Default (GEMINI_API_KEY)',
      rawKey,
      enabled: true,
      // Same priority tier for every env-bootstrapped key so they round-robin
      // via LRU instead of always hammering "key 1".
      priority: 0,
    }));
  });
  markDuplicates();
}

/**
 * Identical credentials are one quota bucket. Only the first copy
 * (lowest priority number, then id) is eligible; the others are kept for the
 * admin UI but never selected and never counted as extra capacity.
 */
function markDuplicates() {
  const seen = new Map();
  const ordered = Array.from(pool.values()).sort(
    (a, b) => a.priority - b.priority || String(a.id).localeCompare(String(b.id))
  );
  for (const entry of ordered) {
    const first = seen.get(entry.fingerprint);
    if (!first) {
      seen.set(entry.fingerprint, entry.id);
      entry.duplicateOf = null;
    } else {
      if (entry.duplicateOf !== first) {
        plog('warn', 'DUPLICATE CREDENTIAL IGNORED', { project: keyLogName(entry), duplicateOf: first });
      }
      entry.duplicateOf = first;
    }
  }
}

function normalizeModelCooldowns(value) {
  if (!value) return {};
  const plain = value instanceof Map ? Object.fromEntries(value.entries()) : typeof value === 'object' ? { ...value } : {};
  const out = {};
  for (const [key, until] of Object.entries(plain)) out[mk(key)] = until; // tolerate legacy dotted keys
  return out;
}

function maxFutureDate(a, b) {
  const now = Date.now();
  const best = Math.max(ts(a), ts(b));
  return best > now ? new Date(best) : null;
}

/**
 * Refreshes `pool` from Mongo. Live runtime fields (in-flight, LRU, streaks)
 * of existing entries are preserved. Cooldowns are merged with the shared
 * state (latest future time wins) so another worker's cooldown is honored;
 * an explicit admin reload (`authoritative`) adopts the DB values instead so
 * an operator can clear cooldowns.
 */
async function loadFromDB({ authoritative = false } = {}) {
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
    const dbModelCooldowns = normalizeModelCooldowns(doc.modelCooldowns);
    const modelCooldowns = {};
    const localModelCooldowns = existing?.modelCooldowns || {};
    for (const key of new Set([...Object.keys(dbModelCooldowns), ...Object.keys(localModelCooldowns)])) {
      const merged = authoritative
        ? maxFutureDate(dbModelCooldowns[key], null)
        : maxFutureDate(dbModelCooldowns[key], localModelCooldowns[key]);
      if (merged) modelCooldowns[key] = merged;
    }

    // An operator re-enabling a key we marked invalid flips the DB status
    // back; adopt that after a short grace so our own pending write can land.
    let status = existing?.status ?? doc.status;
    let invalidAt = existing?.invalidAt || 0;
    if (existing?.status === 'invalid' && doc.status !== 'invalid' && Date.now() - invalidAt > 10_000) {
      status = doc.status;
      invalidAt = 0;
    }

    const next = newEntryState(id, true, {
      label: doc.label,
      rawKey,
      enabled: doc.enabled,
      priority: doc.priority,
      projectKey: doc.projectId || existing?.projectKey || null,
      status,
      invalidAt,
      consecutiveFailures: existing?.consecutiveFailures ?? doc.consecutiveFailures ?? 0,
      cooldownUntil: authoritative
        ? maxFutureDate(doc.cooldownUntil, null)
        : maxFutureDate(doc.cooldownUntil, existing?.cooldownUntil),
      lastUsedAt: existing?.lastUsedAt ?? doc.lastUsedAt ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? doc.lastSuccessAt ?? null,
      lastFailureAt: existing?.lastFailureAt ?? doc.lastFailureAt ?? null,
      lastErrorCode: existing?.lastErrorCode ?? doc.lastErrorCode ?? null,
      lastErrorMessage: existing?.lastErrorMessage ?? doc.lastErrorMessage ?? null,
      totalRequests: existing?.totalRequests ?? doc.totalRequests ?? 0,
      totalSuccesses: existing?.totalSuccesses ?? doc.totalSuccesses ?? 0,
      totalFailures: existing?.totalFailures ?? doc.totalFailures ?? 0,
      inFlight: existing?.inFlight ?? 0,
      totalTokensUsed: existing?.totalTokensUsed ?? doc.totalTokensUsed ?? 0,
      promptTokensUsed: existing?.promptTokensUsed ?? doc.promptTokensUsed ?? 0,
      candidateTokensUsed: existing?.candidateTokensUsed ?? doc.candidateTokensUsed ?? 0,
      dailyTokensUsed: existing?.dailyTokensUsed ?? doc.dailyTokensUsed ?? 0,
      lastTokenResetAt: existing?.lastTokenResetAt ?? doc.lastTokenResetAt ?? null,
      modelCooldowns,
      failureStreaks: existing?.failureStreaks || {},
    });
    pool.set(id, next);
  }

  // Drop keys removed from the DB (never env-bootstrap entries).
  for (const id of Array.from(pool.keys())) {
    if (!id.startsWith('env-') && !seenIds.has(id)) pool.delete(id);
  }
  markDuplicates();
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
          await loadFromDB({ authoritative: force });
          lastSyncAt = Date.now();
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
  lastSyncAt = 0;
}

/**
 * Pulls cooldowns written by OTHER workers/instances into this process's view
 * (throttled). Only future timestamps are merged and the later one wins, so
 * this can never shorten a wait this process already knows about.
 */
async function syncSharedState(force = false) {
  if (!isMongoReady()) return;
  if (!force && Date.now() - lastSyncAt < getStateSyncMs()) return;
  if (syncPromise) return syncPromise;
  lastSyncAt = Date.now();

  syncPromise = (async () => {
    try {
      const now = Date.now();
      const docs = await GeminiApiKey.find({}).select('cooldownUntil modelCooldowns status projectId').lean();
      for (const doc of docs || []) {
        const entry = pool.get(String(doc._id));
        if (!entry) continue;
        const cooldown = ts(doc.cooldownUntil);
        if (cooldown > now && cooldown > ts(entry.cooldownUntil)) entry.cooldownUntil = new Date(cooldown);
        for (const [key, until] of Object.entries(normalizeModelCooldowns(doc.modelCooldowns))) {
          const t = ts(until);
          if (t > now && t > ts(entry.modelCooldowns[key])) entry.modelCooldowns[key] = new Date(t);
        }
        if (doc.status === 'invalid' && entry.status !== 'invalid') {
          entry.status = 'invalid';
          entry.invalidAt = now;
        }
        if (doc.projectId && !entry.projectKey) entry.projectKey = doc.projectId;
      }

      const states = await GeminiPoolState.find({ kind: 'model_capacity' }).lean();
      for (const state of states || []) {
        const key = mk(state.model || String(state._id).replace(/^capacity:/, ''));
        const t = ts(state.until);
        if (t > now && t > Number(globalModelCooldowns.get(key) || 0)) globalModelCooldowns.set(key, t);
      }
    } catch (error) {
      console.error('Gemini pool: shared state sync failed', error.message);
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

// ------------------------------------------------------ availability state --

function groupMembers(entry) {
  const group = groupOf(entry);
  return Array.from(pool.values()).filter((e) => groupOf(e) === group);
}

/** ms until the project-wide cooldown (any member of the project) ends. */
function projectCooldownRemaining(members, now = Date.now()) {
  return Math.max(0, ...members.map((e) => ts(e.cooldownUntil) - now));
}

/** ms until this project's quota for `model` is available again. */
function modelCooldownRemaining(entryOrMembers, model, now = Date.now()) {
  const members = Array.isArray(entryOrMembers) ? entryOrMembers : [entryOrMembers];
  return Math.max(0, ...members.map((e) => ts(e?.modelCooldowns?.[mk(model)]) - now));
}

function globalModelCooldownRemaining(model) {
  const until = Number(globalModelCooldowns.get(mk(model)) || 0);
  return until > Date.now() ? until - Date.now() : 0;
}

function getNextModelCooldown(entry, models) {
  const items = (models || [])
    .map((model) => ({ model, remainingMs: modelCooldownRemaining(entry, model) }))
    .filter((x) => x.remainingMs > 0)
    .sort((a, b) => a.remainingMs - b.remainingMs);
  return items[0] || null;
}

function markGlobalModelCapacity(model, cooldownMs) {
  if (!model || !(cooldownMs > 0)) return;
  const until = Date.now() + cooldownMs;
  if (until > Number(globalModelCooldowns.get(mk(model)) || 0)) globalModelCooldowns.set(mk(model), until);
  if (isMongoReady()) {
    Promise.resolve(
      GeminiPoolState.updateOne(
        { _id: `capacity:${mk(model)}` },
        { $max: { until: new Date(until) }, $set: { kind: 'model_capacity', model: String(model) } },
        { upsert: true }
      )
    ).catch((error) => console.error('Gemini pool: failed to persist model capacity state', error.message));
  }
}

function clearGlobalModelCapacity(model) {
  if (!model || !globalModelCooldowns.has(mk(model))) return;
  globalModelCooldowns.delete(mk(model));
  if (isMongoReady()) {
    Promise.resolve(GeminiPoolState.deleteOne({ _id: `capacity:${mk(model)}` })).catch(() => {});
  }
}

/**
 * Records a cooldown for a project (scope "project") or a project+model quota
 * (scope "model"). Shared by every credential of the same Google Cloud
 * project, and persisted with an atomic $max so concurrent workers can only
 * ever extend, never shorten, each other's cooldowns.
 */
function applyCooldown(entry, { model, scope, untilMs }) {
  if (!(untilMs > Date.now())) return;
  const date = new Date(untilMs);
  for (const member of groupMembers(entry)) {
    if (scope === 'project') {
      if (ts(member.cooldownUntil) < untilMs) member.cooldownUntil = date;
      persistAsync(member.id, { $max: { cooldownUntil: date } });
    } else {
      member.modelCooldowns = member.modelCooldowns || {};
      if (ts(member.modelCooldowns[mk(model)]) < untilMs) member.modelCooldowns[mk(model)] = date;
      persistAsync(member.id, { $max: { [`modelCooldowns.${mk(model)}`]: date } });
    }
  }
}

/**
 * Why a project/model pair can or cannot take a request right now.
 * `waitMs` is only set when a timed cooldown is the reason.
 */
function evaluatePair(entry, model, ctx, now, members) {
  if (!entry.enabled) return { ok: false, permanent: true };
  if (entry.status === 'invalid' || entry.status === 'disabled') return { ok: false, permanent: true };
  if (entry.duplicateOf) return { ok: false, permanent: true };
  if (ctx?.excludeIds?.includes(entry.id)) return { ok: false, local: true };

  const group = groupOf(entry);
  if (ctx) {
    if (ctx.blockedGroups.has(group) || ctx.blockedModels.has(mk(model)) || ctx.blockedPairs.has(`${group}|${mk(model)}`)) {
      return { ok: false, local: true };
    }
  }

  const wait = Math.max(
    projectCooldownRemaining(members, now),
    model == null ? 0 : modelCooldownRemaining(members, model, now),
    model == null ? 0 : globalModelCooldownRemaining(model)
  );
  if (wait > 0) return { ok: false, waitMs: wait };
  if (entry.inFlight >= getPerKeyConcurrency()) return { ok: false, waitMs: 250 };
  return { ok: true };
}

function compareEntries(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return ts(a.lastUsedAt) - ts(b.lastUsedAt); // least-recently-used first
}

/**
 * Picks the next (project, model) pair: first model in preference order that
 * has an eligible project; among projects, lowest priority number then LRU.
 * Cooling/invalid/already-failed projects are skipped without any request.
 */
function pickPair(models, ctx, allowNewProject) {
  const now = Date.now();
  const all = Array.from(pool.values());
  const byGroup = new Map();
  for (const e of all) {
    const g = groupOf(e);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(e);
  }

  for (const model of models) {
    const candidates = all.filter((entry) => {
      const group = groupOf(entry);
      if (!allowNewProject && !ctx.attemptedGroups.has(group)) return false;
      return evaluatePair(entry, model, ctx, now, byGroup.get(group)).ok;
    });
    if (candidates.length) {
      candidates.sort(compareEntries);
      return { entry: candidates[0], model };
    }
  }
  return { entry: null, model: null };
}

/**
 * Earliest moment any non-permanently-dead project/model pair may be tried
 * again (ms from now), or null when nothing is waiting on a timer.
 */
function earliestRetryMs(models, ctx) {
  const now = Date.now();
  const all = Array.from(pool.values());
  let best = null;
  for (const entry of all) {
    const members = groupMembers(entry);
    for (const model of models) {
      const state = evaluatePair(entry, model, null, now, members);
      if (state.permanent) continue;
      const wait = state.ok ? 0 : state.waitMs;
      if (wait == null) continue;
      if (best === null || wait < best) best = wait;
    }
  }
  return best;
}

/**
 * Backwards-compatible selector: best enabled, usable project (no
 * project-wide cooldown, under its concurrency cap), lowest priority then LRU.
 */
function selectKey(excludeIds = []) {
  const now = Date.now();
  const ctx = { excludeIds, blockedGroups: new Set(), blockedModels: new Set(), blockedPairs: new Set() };
  const candidates = Array.from(pool.values()).filter(
    (entry) => evaluatePair(entry, null, ctx, now, groupMembers(entry)).ok
  );
  if (candidates.length === 0) return null;
  candidates.sort(compareEntries);
  return candidates[0];
}

function markAcquired(entry) {
  entry.inFlight += 1;
  entry.lastUsedAt = new Date();
  entry.totalRequests += 1;
  entry.status = entry.status === 'invalid' || entry.status === 'disabled' ? entry.status : 'busy';
  persistAsync(entry.id, { lastUsedAt: entry.lastUsedAt, $inc: { totalRequests: 1 } });
}

function releaseInFlight(entry) {
  entry.inFlight = Math.max(0, entry.inFlight - 1);
}

function markSuccess(entry, model = null) {
  releaseInFlight(entry);
  entry.consecutiveFailures = 0;
  const update = {
    status: 'healthy',
    consecutiveFailures: 0,
    lastSuccessAt: new Date(),
    lastErrorCode: null,
    lastErrorMessage: null,
    $inc: { totalSuccesses: 1 },
  };
  // A success proves this project is serving this model: clear that quota's
  // cooldown (and the project-wide one) and reset its failure streak.
  if (model) {
    delete entry.failureStreaks?.[mk(model)];
    if (entry.modelCooldowns?.[mk(model)]) {
      delete entry.modelCooldowns[mk(model)];
      update.$unset = { [`modelCooldowns.${mk(model)}`]: 1 };
    }
  }
  delete entry.failureStreaks?.project;
  if (entry.cooldownUntil) {
    entry.cooldownUntil = null;
    update.cooldownUntil = null;
  }
  entry.status = 'healthy';
  entry.lastSuccessAt = update.lastSuccessAt;
  entry.totalSuccesses += 1;
  entry.lastErrorCode = null;
  entry.lastErrorMessage = null;
  persistAsync(entry.id, update);
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

class PoolExhaustedError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'PoolExhaustedError';
    this.code = 'GEMINI_POOL_EXHAUSTED';
    this.retryAfterMs = retryAfterMs;
  }
}

const TEMPORARY_CATEGORIES = ['rate_limit', 'quota_exceeded', 'capacity', 'timeout', 'transient', 'unknown'];
const CATEGORY_PRIORITY = ['quota_exceeded', 'rate_limit', 'capacity', 'timeout', 'transient', 'unknown', 'invalid', 'bad_output'];

function errorSummary(error) {
  return {
    status: error?.response?.status || null,
    message: String(error?.response?.data?.error?.message || error?.message || 'Unknown error').slice(0, 300),
  };
}

function newRequestContext(modelList, options, requestId) {
  return {
    requestId,
    models: modelList,
    legacy: Boolean(options.legacy),
    attempts: 0,
    attemptedGroups: new Set(),
    attemptedKeyIds: [],
    blockedGroups: new Set(), // project unusable for the rest of this request
    blockedModels: new Set(), // model unusable for the rest of this request (shared capacity)
    blockedPairs: new Set(), // project+model unusable for the rest of this request
    failures: {},
    badOutputs: 0,
    lastFailedEntry: null,
  };
}

/**
 * Classifies one failed attempt, updates the affected project/model state and
 * the per-request exclusions. Returns an Error to rethrow when the failure
 * cannot be fixed by trying another project, otherwise null (keep failing over).
 */
function handleAttemptFailure(entry, model, error, ctx, startedAt) {
  releaseInFlight(entry);
  const info = classify(error);
  const summary = errorSummary(error);
  const group = groupOf(entry);
  const pairKey = `${group}|${mk(model)}`;
  ctx.failures[info.classification] = (ctx.failures[info.classification] || 0) + 1;
  ctx.lastFailedEntry = entry;

  entry.lastFailureAt = new Date();
  entry.totalFailures += 1;
  entry.lastErrorCode = String(error?.response?.status || error?.code || info.classification);
  entry.lastErrorMessage = summary.message.slice(0, 500);
  const update = {
    lastFailureAt: entry.lastFailureAt,
    lastErrorCode: entry.lastErrorCode,
    lastErrorMessage: entry.lastErrorMessage,
    $inc: { totalFailures: 1, failureCount: 1 },
  };

  // Learn which Google Cloud project this credential belongs to so keys of
  // the same project share cooldown state from now on.
  if (info.projectKey && entry.projectKey !== info.projectKey) {
    entry.projectKey = info.projectKey;
    update.projectId = info.projectKey;
  }

  const base = {
    project: keyLogName(entry),
    keyId: entry.id,
    model,
    status: summary.status,
    reason: info.classification,
    latencyMs: Date.now() - startedAt,
  };
  let rethrow = null;

  switch (info.classification) {
    case 'permanent':
      // Bad request / unsupported model: another project cannot fix it.
      entry.status = 'healthy';
      update.status = 'healthy';
      plog('warn', 'REQUEST REJECTED (not retried)', { ...base, message: summary.message });
      rethrow = error;
      break;

    case 'invalid':
      entry.status = 'invalid';
      entry.invalidAt = Date.now();
      entry.cooldownUntil = null;
      update.status = 'invalid';
      update.cooldownUntil = null;
      ctx.blockedGroups.add(group);
      plog('error', 'CREDENTIAL INVALID - excluded until re-enabled', { ...base, message: summary.message });
      break;

    case 'bad_output':
      // The provider answered but the output was unusable. That is not a
      // project fault: no cooldown, just try another project/model.
      entry.status = 'healthy';
      update.status = 'healthy';
      ctx.blockedPairs.add(pairKey);
      ctx.badOutputs += 1;
      plog('warn', 'UNUSABLE MODEL OUTPUT - trying another project', base);
      if (ctx.badOutputs >= getMaxBadOutputAttempts()) rethrow = error;
      break;

    case 'capacity': {
      // Shared model capacity: the project is fine, the MODEL is not.
      entry.status = 'healthy';
      update.status = 'healthy';
      if (ctx.legacy) {
        ctx.blockedPairs.add(pairKey);
      } else {
        ctx.blockedModels.add(mk(model));
        const cooldownMs = cooldownMsFor(info, 1);
        markGlobalModelCapacity(model, cooldownMs);
        plog('warn', 'MODEL CAPACITY - avoiding model, not the project', {
          ...base,
          modelCooldownMs: cooldownMs,
          nextModel: ctx.models.find((m) => !ctx.blockedModels.has(mk(m))) || null,
        });
      }
      break;
    }

    case 'rate_limit':
    case 'quota_exceeded':
    case 'timeout':
    case 'transient':
    default: {
      const scope = ctx.legacy ? 'project' : info.scope === 'project' ? 'project' : 'model';
      const streakKey = scope === 'project' ? 'project' : mk(model);
      entry.failureStreaks = entry.failureStreaks || {};
      entry.failureStreaks[streakKey] = (entry.failureStreaks[streakKey] || 0) + 1;
      entry.consecutiveFailures += 1;

      const cooldownMs = cooldownMsFor(info, entry.failureStreaks[streakKey]);
      const untilMs = Date.now() + cooldownMs;
      applyCooldown(entry, { model, scope, untilMs });
      if (scope === 'project') ctx.blockedGroups.add(group);
      else ctx.blockedPairs.add(pairKey);

      const isQuota = info.classification === 'rate_limit' || info.classification === 'quota_exceeded';
      entry.status = isQuota ? 'rate_limited' : 'degraded';
      update.status = entry.status;
      update.consecutiveFailures = entry.consecutiveFailures;

      plog(isQuota ? 'warn' : 'warn', isQuota ? 'PROJECT RATE LIMITED' : 'PROJECT ATTEMPT FAILED', {
        ...base,
        scope,
        quotaId: info.quotaId || null,
        providerRetryAfterMs: info.retryAfterMs || 0,
        daily: info.classification === 'quota_exceeded',
      });
      plog('info', 'PROJECT TEMPORARILY EXCLUDED', {
        project: base.project,
        model,
        scope,
        excludedForMs: cooldownMs,
        until: cooldownMs > 0 ? new Date(untilMs).toISOString() : null,
      });
      break;
    }
  }

  persistAsync(entry.id, update);
  return rethrow;
}

function buildExhaustedError(ctx, modelList) {
  const retryAfterMs = earliestRetryMs(modelList, ctx);
  const categories = ctx.failures;
  const present = CATEGORY_PRIORITY.filter((c) => categories[c]);
  const attemptedProjects = ctx.attemptedGroups.size;

  const usable = Array.from(pool.values()).some(
    (e) => e.enabled && e.status !== 'invalid' && e.status !== 'disabled' && !e.duplicateOf
  );
  const hasTemporaryFailure = present.some((c) => TEMPORARY_CATEGORIES.includes(c));
  const temporary = usable && (hasTemporaryFailure || (ctx.attempts === 0 && retryAfterMs !== null));
  const shouldRetry = temporary && retryAfterMs !== null;

  let classification;
  let reason;
  if (!usable) {
    classification = 'invalid';
    reason = pool.size === 0 ? 'no_keys' : 'no_usable_credentials';
  } else if (present.length === 0) {
    classification = retryAfterMs !== null ? 'cooldown' : 'unavailable';
    reason = retryAfterMs !== null ? 'all_projects_cooling_down' : 'no_eligible_project';
  } else if (present.every((c) => c === 'capacity')) {
    classification = 'capacity';
    reason = 'model_capacity';
  } else {
    classification = present[0];
    reason = present[0] === 'quota_exceeded' ? 'daily_quota_exhausted'
      : present[0] === 'rate_limit' ? 'all_projects_rate_limited'
        : present[0] === 'invalid' ? 'all_credentials_invalid'
          : 'projects_failed';
  }

  const retryAt = retryAfterMs !== null ? new Date(Date.now() + retryAfterMs).toISOString() : null;
  const seconds = retryAfterMs !== null ? Math.max(1, Math.ceil(retryAfterMs / 1000)) : null;

  let message;
  if (!usable) {
    message = pool.size === 0
      ? 'No Gemini API keys are configured.'
      : 'No enabled, valid Gemini credentials are available (all are invalid, disabled or duplicates).';
  } else if (ctx.attempts === 0) {
    message = retryAfterMs !== null
      ? `All Gemini keys are temporarily unavailable; shortest cooldown is ${seconds}s.`
      : 'No enabled, healthy Gemini API keys are available.';
  } else {
    message = `Gemini pool exhausted after trying ${attemptedProjects} project(s) (${present.join(', ') || 'no failures'})` +
      (seconds !== null ? `; earliest retry in ${seconds}s.` : '.');
  }

  const result = {
    reason,
    classification,
    temporary,
    shouldRetry,
    retryAfterMs,
    retryAt,
    attemptedProjects,
    failureCategories: { ...categories },
    requestId: ctx.requestId,
  };

  const error = new PoolExhaustedError(message, retryAfterMs);
  Object.assign(error, result, { attemptedKeyIds: ctx.attemptedKeyIds.slice(), result });
  plog('warn', 'POOL EXHAUSTED', { ...result, attempts: ctx.attempts });
  return error;
}

/**
 * Runs `requestFn(rawKey, model)` with project selection and failover.
 *
 * One call = one logical AI operation. On a project-specific rate limit the
 * affected project/model is marked unavailable and the SAME call immediately
 * continues with the next eligible project (same model first), so the caller
 * never sees the failure and nobody has to click Generate again. A model
 * is abandoned for the request only when it reports shared capacity trouble
 * or no eligible project remains for it; then the next model is used.
 * Each pair is tried at most once per call, bounded by the number of
 * projects, GEMINI_POOL_MAX_KEY_ATTEMPTS and GEMINI_POOL_REQUEST_DEADLINE_MS.
 *
 * `requestFn` must resolve with the provider result or reject with the
 * provider error. Throws PoolExhaustedError (structured, see
 * buildExhaustedError) when nothing could complete the operation.
 *
 * @returns {Promise<{result: any, keyId: string, model: string, attempts: number, projectsTried: number}>}
 */
async function executeModels(models, requestFn, options = {}) {
  await loadPool();
  await syncSharedState();

  const modelList = Array.isArray(models) ? models.filter(Boolean).filter((m, i, a) => a.indexOf(m) === i) : [];
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

  const requestId = options.requestId || getJobContext().jobId || crypto.randomBytes(4).toString('hex');
  const ctx = newRequestContext(modelList, options, requestId);
  const distinctProjects = new Set(Array.from(pool.values()).filter((e) => !e.duplicateOf).map(groupOf)).size;
  const maxProjects = Math.max(1, Math.min(distinctProjects || 1, getMaxKeyAttempts()));
  const maxAttempts = maxProjects * modelList.length;
  const deadlineMs = getRequestDeadlineMs();
  const deadlineAt = deadlineMs > 0 ? Date.now() + deadlineMs : 0;

  while (ctx.attempts < maxAttempts) {
    if (deadlineAt && Date.now() > deadlineAt) {
      plog('warn', 'FAILOVER DEADLINE REACHED', { requestId, attempts: ctx.attempts });
      break;
    }

    // Other workers may have exhausted a project since our last attempt.
    await syncSharedState();

    const pick = pickPair(modelList, ctx, ctx.attemptedGroups.size < maxProjects);
    if (!pick.entry) break;
    const { entry, model } = pick;

    if (ctx.lastFailedEntry && ctx.lastFailedEntry.id !== entry.id) {
      plog('info', 'SWITCHING PROJECT', {
        requestId,
        from: keyLogName(ctx.lastFailedEntry),
        to: keyLogName(entry),
        model,
        attempt: ctx.attempts + 1,
      });
    }

    ctx.attempts += 1;
    ctx.attemptedGroups.add(groupOf(entry));
    if (!ctx.attemptedKeyIds.includes(entry.id)) ctx.attemptedKeyIds.push(entry.id);
    markAcquired(entry);
    const startedAt = Date.now();
    plog('info', 'PROJECT SELECTED', {
      requestId,
      project: keyLogName(entry),
      keyId: entry.id,
      model,
      attempt: ctx.attempts,
      projectsTried: ctx.attemptedGroups.size,
    });

    let result;
    try {
      result = await requestFn(entry.rawKey, model);
    } catch (error) {
      const rethrow = handleAttemptFailure(entry, model, error, ctx, startedAt);
      if (rethrow) throw rethrow;
      continue;
    }

    // Count tokens for every successful provider response at the pool
    // boundary (even if the caller later rejects the content).
    recordTokenUsageFromResult(entry, result, model);
    markSuccess(entry, model);
    clearGlobalModelCapacity(model);
    plog('info', ctx.attempts > 1 ? 'FALLBACK PROJECT SUCCEEDED' : 'REQUEST SUCCEEDED', {
      requestId,
      project: keyLogName(entry),
      keyId: entry.id,
      model,
      attempt: ctx.attempts,
      projectsTried: ctx.attemptedGroups.size,
      latencyMs: Date.now() - startedAt,
    });
    return { result, keyId: entry.id, model, attempts: ctx.attempts, projectsTried: ctx.attemptedGroups.size };
  }

  throw buildExhaustedError(ctx, modelList);
}

/**
 * Model-less variant kept for existing callers/tests: every rate limit is
 * treated as project-wide because there is no model dimension.
 *
 * @returns {Promise<{result: any, keyId: string}>}
 */
async function execute(requestFn, options = {}) {
  const out = await executeModels(['*'], (rawKey) => requestFn(rawKey), { ...options, legacy: true });
  return { result: out.result, keyId: out.keyId };
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
  const snapshotModels = modelListForSnapshot();
  const keys = Array.from(pool.values()).map((e) => {
    maybeResetDailyTokens(e);
    const modelCooldowns = {};
    for (const model of snapshotModels) {
      const until = ts(e.modelCooldowns?.[mk(model)]);
      if (until > now) modelCooldowns[model] = new Date(until).toISOString();
    }
    return {
      id: e.id,
      label: e.label,
      persisted: e.persisted,
      enabled: e.enabled,
      priority: e.priority,
      status: e.status,
      projectId: e.projectKey || null,
      duplicateOf: e.duplicateOf || null,
      consecutiveFailures: e.consecutiveFailures,
      cooldownRemainingMs: e.cooldownUntil ? Math.max(0, ts(e.cooldownUntil) - now) : 0,
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
      modelCooldowns,
      activeModelCooldown: getNextModelCooldown(e, snapshotModels),
      isOutOfTokens: e.status === 'rate_limited' || (DAILY_TOKEN_LIMIT > 0 && (e.dailyTokensUsed || 0) >= DAILY_TOKEN_LIMIT),
    };
  });

  const activeRequests = keys.reduce((sum, k) => sum + k.inFlight, 0);
  const availableNow = Array.from(pool.values()).some((entry) => {
    const members = groupMembers(entry);
    return snapshotModels.some((model) => evaluatePair(entry, model, null, now, members).ok);
  });
  const totalDailyTokens = keys.reduce((sum, k) => sum + k.dailyTokensUsed, 0);
  const outOfTokensKeys = keys.filter((k) => k.isOutOfTokens).length;
  const globalModelCapacityCooldowns = Object.fromEntries(
    snapshotModels
      .map((model) => {
        const remainingMs = globalModelCooldownRemaining(model);
        return remainingMs > 0
          ? [model, { remainingMs, until: new Date(Date.now() + remainingMs).toISOString() }]
          : null;
      })
      .filter(Boolean)
  );

  return {
    totalKeys: keys.length,
    enabledKeys: keys.filter((k) => k.enabled).length,
    healthyKeys: keys.filter((k) => k.enabled && k.status === 'healthy').length,
    rateLimitedKeys: keys.filter((k) => k.status === 'rate_limited').length,
    invalidKeys: keys.filter((k) => k.status === 'invalid').length,
    disabledKeys: keys.filter((k) => !k.enabled).length,
    duplicateKeys: keys.filter((k) => k.duplicateOf).length,
    outOfTokensKeys,
    activeRequests,
    totalDailyTokens,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
    globalConcurrency: Number.parseInt(process.env.AI_CONCURRENCY || '1', 10),
    perKeyConcurrency: Number.isFinite(getPerKeyConcurrency()) ? getPerKeyConcurrency() : null,
    globalModelCapacityCooldowns,
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
  syncSharedState,
  PoolExhaustedError,
  // exported for tests only
  _internal: {
    pool,
    globalModelCooldowns,
    bootstrapFromEnv,
    markSuccess,
    markAcquired,
    markTokenUsage,
    markDuplicates,
    syncSharedState,
    loadFromDB,
    modelKey: mk,
  },
};
