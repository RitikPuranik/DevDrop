'use strict';

const vercelProvider = require('./providers/vercel.provider');
const { loadVercelContext } = require('./vercelContext');
const { redactText, sanitizeText } = require('./logRedaction');
const { ManagementError, fromVercelError } = require('./managementError');

/**
 * Deployment logs, read through Vercel's supported interfaces only:
 *   - build logs   -> GET /v3/deployments/{id}/events?builds=1      (bounded by `limit`)
 *   - runtime logs -> GET /v1/projects/{p}/deployments/{id}/runtime-logs (stream; bounded by lines/bytes/time)
 *   - error logs   -> a *view*: build lines at error severity + runtime error/fatal entries
 *                     + Vercel's own deployment error summary. Browser console output is never involved.
 *
 * Constraints honoured here:
 *   - Never unbounded: every upstream read has a line cap, and a byte/time budget for streams.
 *   - Redaction happens on ingestion, so neither the cache nor any response ever holds raw secrets.
 *   - Nothing is written to the database. The only copy is a short-lived, size-bounded,
 *     per-process in-memory snapshot (default 20s) that exists so paging doesn't re-hit Vercel.
 *   - Vercel exposes no paging/filter parameters for runtime logs, so filtering and paging run over
 *     the bounded snapshot; `truncated` tells the UI when older/newer lines were not read.
 */

const readInt = (key, fallback) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = () => ({
  ttlMs: readInt('LOG_SNAPSHOT_TTL_MS', 20 * 1000),
  minRefreshMs: readInt('LOG_MIN_REFRESH_MS', 4 * 1000),
  maxEvents: readInt('LOG_FETCH_MAX_EVENTS', 1000),
  runtimeMaxBytes: readInt('LOG_RUNTIME_MAX_BYTES', 1024 * 1024),
  runtimeTimeoutMs: readInt('LOG_RUNTIME_TIMEOUT_MS', 6000),
  maxSnapshots: readInt('LOG_MAX_SNAPSHOTS', 50),
  pageDefault: 200,
  pageMax: 500,
});

const LEVELS = ['debug', 'info', 'warning', 'error'];
const TYPES = ['build', 'runtime', 'error'];

// ───────────────────────── snapshot cache (in-memory, bounded, short-lived) ─────────────────────────

const snapshots = new Map(); // key -> { at, value }

const cacheGet = (key, ttlMs) => {
  const hit = snapshots.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    snapshots.delete(key);
    return null;
  }
  return hit;
};

const cacheSet = (key, value, max) => {
  if (snapshots.has(key)) snapshots.delete(key);
  snapshots.set(key, { at: Date.now(), value });
  while (snapshots.size > max) snapshots.delete(snapshots.keys().next().value); // evict oldest
};

const clearSnapshotsForTests = () => snapshots.clear();

// ───────────────────────── normalisation ─────────────────────────

const mapRuntimeLevel = (level) => {
  switch (String(level || '').toLowerCase()) {
    case 'fatal':
    case 'error':
      return 'error';
    case 'warn':
    case 'warning':
      return 'warning';
    case 'debug':
    case 'trace':
      return 'debug';
    default:
      return 'info';
  }
};

// Vercel build events carry no severity field; stderr output is inferred from its text.
const ERROR_TEXT_RE = /\b(error|err!|failed|failure|fatal|exception|cannot find|unhandled|ELIFECYCLE)\b/i;
const mapBuildLevel = (event, text) => {
  const explicit = event?.payload?.level || event?.level;
  if (explicit) return mapRuntimeLevel(explicit);
  if (event?.type === 'stderr') return ERROR_TEXT_RE.test(text) ? 'error' : 'warning';
  if (event?.type === 'fatal' || event?.type === 'error') return 'error';
  return ERROR_TEXT_RE.test(text) && /^(error|\s*npm err)/i.test(text.trim()) ? 'error' : 'info';
};

const normalizeBuildEvents = (events) => {
  const out = [];
  events.forEach((event, index) => {
    const raw = event?.text ?? event?.payload?.text;
    if (typeof raw !== 'string' || !raw.length) return;
    const message = redactText(raw);
    if (!message.trim()) return;
    const ts = Number(event.created ?? event.payload?.created ?? event.date) || 0;
    out.push({
      id: `b-${event.id || event.serial || event.payload?.id || index}`,
      ts,
      source: 'build',
      level: mapBuildLevel(event, message),
      message,
    });
  });
  return out;
};

const normalizeRuntimeEntries = (entries) => {
  const out = [];
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const message = redactText(entry.message);
    const request = entry.requestPath
      ? { method: sanitizeText(entry.requestMethod || '').slice(0, 10), path: redactText(entry.requestPath).slice(0, 300), status: Number(entry.responseStatusCode) || null }
      : null;
    if (!message.trim() && !request) return;
    out.push({
      id: `r-${entry.rowId || index}`,
      ts: Number(entry.timestampInMs) || 0,
      source: 'runtime',
      level: mapRuntimeLevel(entry.level),
      message: message || (request ? `${request.method} ${request.path}` : ''),
      ...(request ? { request } : {}),
      ...(entry.source ? { origin: sanitizeText(entry.source).slice(0, 30) } : {}),
    });
  });
  return out;
};

// ───────────────────────── availability ─────────────────────────

/** What can be read for this deployment, based on its stored state (the fetch may still downgrade it). */
const describeAvailability = (version) => {
  const state = version.state;
  const build =
    version.availability === 'unavailable'
      ? { status: 'unavailable', message: 'Vercel no longer has this deployment.' }
      : ['QUEUED', 'INITIALIZING'].includes(state)
        ? { status: 'pending', message: 'The build has not started producing logs yet.' }
        : { status: 'available', message: null };

  let runtime;
  if (version.availability === 'unavailable') runtime = { status: 'unavailable', message: 'Vercel no longer has this deployment.' };
  else if (state !== 'READY') runtime = { status: 'unavailable', message: 'Runtime logs only exist for deployments that finished building successfully.' };
  else runtime = { status: 'available', message: 'Vercel keeps runtime logs for a limited time that depends on your plan; older entries may be gone.' };

  const error = build.status === 'available' || runtime.status === 'available' ? { status: 'available', message: 'Errors from the build and runtime logs, plus Vercel\'s deployment error summary.' } : { status: 'unavailable', message: build.message };
  return { build, runtime, error };
};

// ───────────────────────── fetching ─────────────────────────

const classifyFailure = (error) => {
  const mapped = fromVercelError(error);
  if (['VERCEL_NOT_FOUND', 'VERCEL_GONE'].includes(mapped.code)) return { status: 'expired', message: 'Vercel no longer has these logs (they may have passed the retention period).' };
  if (['VERCEL_PERMISSION_DENIED', 'VERCEL_PLAN_RESTRICTION'].includes(mapped.code)) {
    return { status: 'restricted', message: 'Vercel did not allow DevDrop to read these logs. The connected integration may lack log access, or your plan may not include them.' };
  }
  throw mapped; // rate limit / outage / auth: let the caller report it
};

const fetchSource = async (kind, version, ctx, { refresh }) => {
  const cfg = config();
  const key = `${version.userId}:${version._id}:${kind}`;
  const cached = cacheGet(key, refresh ? cfg.minRefreshMs : cfg.ttlMs);
  if (cached) return { ...cached.value, at: cached.at, fromCache: true, throttled: Boolean(refresh) };

  let value;
  try {
    if (kind === 'build') {
      const events = await vercelProvider.getBuildEvents(ctx.credential, ctx.metadata, version.vercelDeploymentId, { limit: cfg.maxEvents });
      value = { status: 'ok', message: null, entries: normalizeBuildEvents(events), truncated: events.length >= cfg.maxEvents };
    } else {
      const { entries, truncated } = await vercelProvider.readRuntimeLogs(ctx.credential, ctx.metadata, ctx.projectId, version.vercelDeploymentId, {
        maxLines: cfg.maxEvents,
        maxBytes: cfg.runtimeMaxBytes,
        timeoutMs: cfg.runtimeTimeoutMs,
      });
      value = { status: 'ok', message: null, entries: normalizeRuntimeEntries(entries), truncated };
    }
  } catch (error) {
    const failure = classifyFailure(error);
    value = { status: failure.status, message: failure.message, entries: [], truncated: false };
  }
  cacheSet(key, value, cfg.maxSnapshots);
  return { ...value, at: Date.now(), fromCache: false, throttled: false };
};

// ───────────────────────── query ─────────────────────────

const parseTime = (value, name) => {
  if (value == null || value === '') return null;
  const n = /^\d+$/.test(String(value)) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(n) || n < 0) throw new ManagementError(400, 'INVALID_TIME_RANGE', `"${name}" is not a valid time.`);
  return n;
};

const parseSeverities = (value) => {
  if (!value) return null;
  const list = String(value).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = list.find((s) => !LEVELS.includes(s));
  if (bad) throw new ManagementError(400, 'INVALID_SEVERITY', `Unknown severity "${bad}". Use: ${LEVELS.join(', ')}.`);
  return new Set(list);
};

const encodeCursor = (offset, at) => Buffer.from(JSON.stringify({ o: offset, a: at })).toString('base64url');
const decodeCursor = (cursor) => {
  if (!cursor) return { offset: 0, at: null };
  try {
    const { o, a } = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Number.isInteger(o) || o < 0) throw new Error('bad offset');
    return { offset: o, at: a ?? null };
  } catch {
    throw new ManagementError(400, 'INVALID_CURSOR', 'The log cursor is not valid.');
  }
};

/**
 * @param {object} version DeploymentVersion document (already authorised by the caller)
 * @param {object} site    Deployment document
 * @param {{type:string,q?:string,severity?:string,since?:any,until?:any,cursor?:string,limit?:any,order?:string,refresh?:boolean}} query
 */
const getLogs = async (site, version, query = {}) => {
  const cfg = config();
  const type = String(query.type || 'build').toLowerCase();
  if (!TYPES.includes(type)) throw new ManagementError(400, 'INVALID_LOG_TYPE', `Log type must be one of: ${TYPES.join(', ')}.`);

  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : '';
  const severities = parseSeverities(query.severity);
  const since = parseTime(query.since, 'since');
  const until = parseTime(query.until, 'until');
  if (since != null && until != null && until < since) throw new ManagementError(400, 'INVALID_TIME_RANGE', '"until" must be after "since".');
  const order = String(query.order || (type === 'build' ? 'asc' : 'desc')).toLowerCase() === 'desc' ? 'desc' : 'asc';
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || cfg.pageDefault, 1), cfg.pageMax);
  const { offset, at: cursorAt } = decodeCursor(query.cursor);

  const availability = describeAvailability(version);
  const wantBuild = type === 'build' || type === 'error';
  const wantRuntime = type === 'runtime' || type === 'error';
  const wantsFetch = (wantBuild && availability.build.status === 'available') || (wantRuntime && availability.runtime.status === 'available');

  const sources = {};
  let combined = [];
  let snapshotAt = Date.now();
  let truncated = false;
  let throttled = false;

  if (wantsFetch) {
    const ctx = await loadVercelContext(site);
    const refresh = Boolean(query.refresh) && !query.cursor;
    const reads = [];
    if (wantBuild && availability.build.status === 'available') reads.push(['build', fetchSource('build', version, ctx, { refresh })]);
    if (wantRuntime && availability.runtime.status === 'available') reads.push(['runtime', fetchSource('runtime', version, ctx, { refresh })]);
    const results = await Promise.all(reads.map(([, p]) => p));
    snapshotAt = Math.min(...results.map((r) => r.at));
    results.forEach((r, i) => {
      const kind = reads[i][0];
      sources[kind] = { status: r.status, message: r.message, truncated: r.truncated };
      truncated = truncated || r.truncated;
      throttled = throttled || r.throttled;
      combined.push(...r.entries);
    });
  }
  if (wantBuild && availability.build.status !== 'available') sources.build = availability.build;
  if (wantRuntime && availability.runtime.status !== 'available') sources.runtime = availability.runtime;

  // A cursor is only meaningful against the snapshot it was issued for.
  if (query.cursor && cursorAt != null && cursorAt !== snapshotAt) {
    throw new ManagementError(409, 'CURSOR_EXPIRED', 'These logs were refreshed while you were scrolling. Reload to continue.', { snapshotAt });
  }

  if (type === 'error') {
    combined = combined.filter((e) => e.level === 'error');
    if (version.errorMessage || version.errorCode) {
      combined.push({
        id: 'summary-1',
        ts: (version.readyAt || version.vercelCreatedAt) ? new Date(version.readyAt || version.vercelCreatedAt).getTime() : 0,
        source: 'deployment',
        level: 'error',
        message: redactText([version.errorCode, version.errorMessage].filter(Boolean).join(': ')),
      });
    }
  }

  // Filters (applied to the already-redacted text).
  const needle = q.toLowerCase();
  const filtered = combined.filter((e) => {
    if (severities && !severities.has(e.level)) return false;
    if (since != null && e.ts && e.ts < since) return false;
    if (until != null && e.ts && e.ts > until) return false;
    if (needle && !(e.message.toLowerCase().includes(needle) || (e.request?.path || '').toLowerCase().includes(needle))) return false;
    return true;
  });

  filtered.sort((a, b) => (order === 'asc' ? a.ts - b.ts : b.ts - a.ts) || a.id.localeCompare(b.id));

  const page = filtered.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  return {
    type,
    entries: page,
    total: filtered.length,
    nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset, snapshotAt) : null,
    order,
    snapshotAt,
    truncated,
    throttled,
    sources,
    availability,
    // Reminder for the UI/consumers: these are Vercel logs, never browser console output.
    note: 'Logs come from Vercel (build events and runtime function/request logs). Browser console output is not included.',
  };
};

module.exports = {
  getLogs,
  describeAvailability,
  normalizeBuildEvents,
  normalizeRuntimeEntries,
  clearSnapshotsForTests,
  config,
  LEVELS,
  TYPES,
};
