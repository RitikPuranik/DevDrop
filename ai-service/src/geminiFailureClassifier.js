/**
 * Classifies Gemini provider failures and derives cooldowns.
 *
 * Environment variables honored here (all parsed with envMs(): an unset or
 * invalid value keeps the default, an explicit 0 is honored as 0):
 *   GEMINI_RATE_LIMIT_COOLDOWN_MS        (default 5000)   base of the internal
 *       exponential backoff used for a 429 when Google gave no retry guidance
 *       (and for repeated 429s on the same quota).
 *       0 disables the internal backoff (the project/model is still skipped
 *       for the rest of the current request, and any provider-supplied wait
 *       is still honored).
 *   GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS    (default 60000)  cap for that internal
 *       backoff ONLY. It never shortens a provider Retry-After / quota reset.
 *   GEMINI_POOL_MAX_COOLDOWN_MS          (default 300000) cap for the internal
 *       backoff used for transient/timeout/unknown failures. Same rule.
 *   GEMINI_MODEL_CAPACITY_COOLDOWN_MS    (default 30000)  how long a model that
 *       reported shared capacity exhaustion (503/overloaded) is avoided by the
 *       whole pool. 0 = only skip it for the current request.
 *
 * Provider guidance (RetryInfo, quota reset metadata, Retry-After header) is
 * always used as-is. Daily quotas wait for the reported reset, or the
 * documented midnight-Pacific reset, never for an arbitrary short backoff.
 */

function envMs(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

const isTimeoutError = (error) =>
  error.code === 'ECONNABORTED' ||
  error.code === 'ETIMEDOUT' ||
  /timeout of \d+ms exceeded/i.test(error.message || '');

const isNetworkResetError = (error) =>
  ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(error.code);

function parseDurationMs(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.ceil(raw));
  const value = String(raw).trim();
  if (!value) return 0;

  let match = value.match(/^([\d.]+)\s*s$/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  match = value.match(/^([\d.]+)\s*ms$/i);
  if (match) return Math.ceil(parseFloat(match[1]));

  let total = 0;
  for (const part of value.matchAll(/([\d.]+)\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?)/gi)) {
    const n = parseFloat(part[1]);
    const unit = part[2].toLowerCase();
    if (unit.startsWith('h')) total += n * 3600000;
    else if (unit === 'm' || unit.startsWith('min')) total += n * 60000;
    else if (unit === 's' || unit.startsWith('sec')) total += n * 1000;
    else total += n;
  }
  return Math.ceil(total);
}

function getErrorDetails(error) {
  const details = error.response?.data?.error?.details;
  return Array.isArray(details) ? details : [];
}

function getErrorInfoMetadata(error) {
  const info = getErrorDetails(error).find((d) => String(d?.['@type'] || '').includes('ErrorInfo'));
  return info?.metadata && typeof info.metadata === 'object' ? info.metadata : {};
}

function getQuotaViolations(error) {
  const failure = getErrorDetails(error).find((d) => String(d?.['@type'] || '').includes('QuotaFailure'));
  return Array.isArray(failure?.violations) ? failure.violations : [];
}

/** Identifiers describing the quota that was hit (never contains credentials). */
function getQuotaInfo(error) {
  const metadata = getErrorInfoMetadata(error);
  const violation = getQuotaViolations(error)[0] || {};
  const dimensions = {
    ...(metadata.quotaDimensions && typeof metadata.quotaDimensions === 'object' ? metadata.quotaDimensions : {}),
    ...(violation.quotaDimensions && typeof violation.quotaDimensions === 'object' ? violation.quotaDimensions : {}),
  };
  return {
    quotaId: String(violation.quotaId || metadata.quotaId || ''),
    quotaMetric: String(violation.quotaMetric || metadata.quotaMetric || ''),
    dimensions,
  };
}

/** Google Cloud project number, when the provider reports it (e.g. "projects/123"). */
function extractProjectKey(error) {
  const metadata = getErrorInfoMetadata(error);
  const consumer = String(metadata.consumer || '').trim();
  const match = consumer.match(/^projects\/([\w.-]+)$/i);
  return match ? match[1] : null;
}

/**
 * Which quota dimension a 429 applies to. Gemini quotas are normally
 * per-project-per-model, so the default is "model": one exhausted model must
 * not poison the project's other models. Only a quota that clearly is not
 * model-scoped (an id/metric without "model" and no model dimension) is
 * treated as project-wide.
 */
function quotaScope(error) {
  const { quotaId, quotaMetric, dimensions } = getQuotaInfo(error);
  const identifier = `${quotaId} ${quotaMetric}`.toLowerCase();
  if (dimensions.model || /model/.test(identifier)) return 'model';
  if (identifier.trim()) return 'project';
  return 'model';
}

function extractQuotaResetAt(error) {
  const metadata = getErrorInfoMetadata(error);
  const rawTimestamp =
    metadata.quotaResetTimeStamp ||
    metadata.quotaResetTimestamp ||
    metadata.resetTimeStamp ||
    metadata.resetTimestamp;

  if (rawTimestamp) {
    const resetAt = new Date(rawTimestamp).getTime();
    if (Number.isFinite(resetAt) && resetAt > Date.now()) return resetAt;
  }

  const rawDelay = metadata.quotaResetDelay || metadata.retryDelay || metadata.resetDelay;
  const delayMs = parseDurationMs(rawDelay);
  return delayMs > 0 ? Date.now() + delayMs : 0;
}

function extractRetryDelayMs(error) {
  const details = getErrorDetails(error);
  const retryInfo = details.find((d) => String(d?.['@type'] || '').includes('RetryInfo'));
  const retryDelayMs = parseDurationMs(retryInfo?.retryDelay);
  if (retryDelayMs > 0) return retryDelayMs;

  const metadata = getErrorInfoMetadata(error);
  const metadataDelay = parseDurationMs(metadata.quotaResetDelay || metadata.retryDelay);
  if (metadataDelay > 0) return metadataDelay;

  const retryAfterHeader = error.response?.headers?.['retry-after'] || error.response?.headers?.['Retry-After'];
  const headerText = String(retryAfterHeader || '').trim();
  const headerSeconds = /^\d+(?:\.\d+)?$/.test(headerText) ? Number(headerText) * 1000 : 0;
  const headerDate = headerText && !headerSeconds ? new Date(headerText).getTime() - Date.now() : 0;
  const headerDelay = Math.max(0, parseDurationMs(headerText), Number.isFinite(headerSeconds) ? headerSeconds : 0, Number.isFinite(headerDate) ? headerDate : 0);
  if (headerDelay > 0) return Math.ceil(headerDelay);

  const message = String(error.response?.data?.error?.message || error.message || '');
  const match = message.match(/(?:retry in|after)\s+([\d.]+)\s*s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : 0;
}

function quotaLooksDaily(error) {
  const metadata = getErrorInfoMetadata(error);
  const quota = getQuotaInfo(error);
  const identifiers = [
    quota.quotaId,
    quota.quotaMetric,
    metadata.quotaId,
    metadata.quotaMetric,
    metadata.quotaLimit,
    metadata.quotaLimitName,
    metadata.limitName,
  ].filter(Boolean).join(' ').toLowerCase();
  const message = String(error.response?.data?.error?.message || error.message || '').toLowerCase();

  return (
    /per.?day|daily|requests?perday|tokens?perday|tpd|rpd/.test(identifiers) ||
    /daily quota|quota.*per day|requests? per day|tokens? per day/.test(message)
  );
}

function nextMidnightPacificMs() {
  const timeZone = 'America/Los_Angeles';
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const current = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );

  // Build tomorrow's Pacific calendar date using a UTC noon anchor, then ask
  // Intl for the correct UTC offset on that date. This handles PST/PDT.
  const anchor = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1, 12, 0, 0));
  const tomorrowDate = dateFormatter.format(anchor);
  const offsetParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(anchor).map((p) => [p.type, p.value])
  );
  const offset = offsetParts.timeZoneName || 'GMT-08:00';
  const normalizedOffset = offset.replace(/^GMT/, '');
  const target = new Date(`${tomorrowDate}T00:00:00${normalizedOffset}`);
  return Number.isNaN(target.getTime())
    ? Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 8, 0, 0)
    : target.getTime();
}


/**
 * Failure categories:
 *   rate_limit     project/model quota (RPM/TPM) hit  -> cool that quota, switch project now
 *   quota_exceeded daily quota (RPD/TPD) hit          -> unavailable until the reset time
 *   capacity       shared model capacity (503, "overloaded") -> avoid the MODEL, not the project
 *   invalid        401/403/API key invalid/service disabled  -> credential unusable
 *   timeout / transient / unknown                       -> bounded backoff, try another project
 *   bad_output     HTTP 200 with unusable generated JSON -> try another project/model, no cooldown
 *   permanent      400/unsupported model/validation     -> surface the error, never rotate
 */
function classify(error) {
  const status = error.response?.status;
  const apiMessage = String(error.response?.data?.error?.message || error.message || '');
  const lowerMessage = apiMessage.toLowerCase();
  const details = getErrorDetails(error);
  const metadata = getErrorInfoMetadata(error);
  const projectKey = extractProjectKey(error);

  if (error.retryableOutput || error.code === 'GEMINI_INVALID_GENERATED_JSON') {
    return { classification: 'bad_output', retryable: true, failoverKey: true };
  }

  if (isTimeoutError(error)) {
    return { classification: 'timeout', retryable: true, failoverKey: true, projectKey };
  }

  if (
    status === 401 ||
    status === 403 ||
    /api key not valid|invalid api key|api key expired|permission denied|has not been used in project|service_disabled|api_key_invalid/i.test(lowerMessage)
  ) {
    return { classification: 'invalid', retryable: false, failoverKey: true, permanentForKey: true, projectKey };
  }

  const quota = getQuotaInfo(error);
  const hasQuotaInfo = Boolean(quota.quotaId || quota.quotaMetric);
  const looksLikeCapacity = /overloaded|high demand|model is currently unavailable|capacity/i.test(lowerMessage);

  // A 429 that says the model is overloaded (and carries no quota metadata)
  // is shared model capacity, not this project's quota.
  if (status === 429 && looksLikeCapacity && !hasQuotaInfo) {
    return { classification: 'capacity', retryable: true, failoverKey: true, retryAfterMs: extractRetryDelayMs(error), projectKey };
  }

  if (status === 429 || /quota exceeded|rate limit exceeded|resource exhausted|resource_exhausted|too many requests/i.test(lowerMessage)) {
    const daily = quotaLooksDaily(error);
    const quotaResetAt = extractQuotaResetAt(error);
    const retryAfterMs = extractRetryDelayMs(error);
    // Daily quotas do not come back after a short RetryInfo delay: wait for
    // the reported reset or the documented midnight-Pacific reset.
    const resetAt = daily ? (quotaResetAt || nextMidnightPacificMs()) : quotaResetAt;

    return {
      classification: daily ? 'quota_exceeded' : 'rate_limit',
      retryable: true,
      failoverKey: true,
      retryAfterMs,
      quotaResetAt: resetAt || 0,
      scope: quotaScope(error),
      quotaId: quota.quotaId || null,
      projectKey,
      quotaMetadata: metadata,
      rawDetails: details,
    };
  }

  if (status === 503 || looksLikeCapacity) {
    return { classification: 'capacity', retryable: true, failoverKey: true, retryAfterMs: extractRetryDelayMs(error), projectKey };
  }

  if (status === 500 || status === 502) {
    return { classification: 'transient', retryable: true, failoverKey: true, retryAfterMs: extractRetryDelayMs(error), projectKey };
  }

  if (status === 408 || status === 504) {
    return { classification: 'timeout', retryable: true, failoverKey: true, projectKey };
  }

  if (isNetworkResetError(error) || /econnreset|network error|socket hang up|broken pipe/i.test(lowerMessage)) {
    return { classification: 'transient', retryable: true, failoverKey: true, projectKey };
  }

  if (status === 400 || status === 404 || status === 413 || status === 422 ||
      /invalid argument|malformed request|unsupported model|not found/i.test(lowerMessage)) {
    return { classification: 'permanent', retryable: false, failoverKey: false };
  }

  return { classification: 'unknown', retryable: true, failoverKey: true, projectKey };
}

const COOLDOWN_STEPS_MS = [2000, 5000, 15000, 30000, 60000];

function withJitter(ms, ratio = 0.2) {
  if (ms <= 0) return 0;
  return Math.max(0, Math.round(ms * (1 - ratio + 2 * ratio * Math.random())));
}

/**
 * Internal backoff (used only when the provider gave no usable guidance).
 * Exponential in the failure streak, jittered, never above `maxMs`.
 */
function internalBackoffMs(failures, baseMs, maxMs) {
  if (baseMs <= 0 || maxMs <= 0) return 0;
  const exponential = baseMs * (2 ** Math.max(0, failures - 1));
  return Math.min(maxMs, withJitter(Math.min(exponential, maxMs)));
}

/**
 * How long a failed quota/model should stay unavailable. Provider guidance is
 * never capped: only the internally computed part is bounded by the env caps.
 * Returns milliseconds; 0 means "no cooldown beyond the current request".
 *
 * @param {object} info   result of classify()
 * @param {number} failures consecutive failures for this project/model
 */
function cooldownMsFor(info, failures = 1) {
  const now = Date.now();
  const providerWait = Math.max(0, Number(info?.retryAfterMs) || 0);

  switch (info?.classification) {
    case 'quota_exceeded':
      return Math.max(0, (Number(info.quotaResetAt) || 0) - now);
    case 'rate_limit': {
      const reset = Math.max(0, (Number(info.quotaResetAt) || 0) - now);
      // Provider guidance wins on the first failure. The internal backoff
      // applies when there is no guidance, or when the same quota keeps
      // failing (so repeated failures never become a rapid retry loop).
      const hasGuidance = reset > 0 || providerWait > 0;
      const internal = hasGuidance && failures <= 1
        ? 0
        : internalBackoffMs(
          failures,
          envMs('GEMINI_RATE_LIMIT_COOLDOWN_MS', 5000),
          envMs('GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS', 60000)
        );
      return Math.max(reset, providerWait, internal);
    }
    case 'capacity': {
      const base = envMs('GEMINI_MODEL_CAPACITY_COOLDOWN_MS', 30000);
      return Math.max(providerWait, withJitter(base));
    }
    case 'timeout':
    case 'transient':
    case 'unknown': {
      const max = envMs('GEMINI_POOL_MAX_COOLDOWN_MS', 300000);
      const step = COOLDOWN_STEPS_MS[Math.min(Math.max(failures - 1, 0), COOLDOWN_STEPS_MS.length - 1)];
      return Math.max(providerWait, Math.min(withJitter(step), max));
    }
    default:
      return 0; // invalid / permanent / bad_output never earn a timed cooldown
  }
}

/** Backwards-compatible wrapper (classification string form). */
function cooldownForFailure(consecutiveFailures, classification, retryAfterMs = 0) {
  return cooldownMsFor({ classification, retryAfterMs }, consecutiveFailures);
}

module.exports = {
  classify,
  cooldownForFailure,
  cooldownMsFor,
  envMs,
  isTimeoutError,
  extractRetryDelayMs,
  extractQuotaResetAt,
  extractProjectKey,
  quotaLooksDaily,
  nextMidnightPacificMs,
};
