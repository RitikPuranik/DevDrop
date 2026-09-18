/**
 * Classifies Gemini provider failures and derives the cooldown for a key/model.
 *
 * Environment variables honored here:
 *   GEMINI_RATE_LIMIT_COOLDOWN_MS       base backoff for 429s
 *   GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS   cap for generic 429 backoff
 *   GEMINI_POOL_MAX_COOLDOWN_MS         cap for capacity/transient backoff
 *
 * When Google supplies a quota reset timestamp/delay, that exact reset is used
 * instead of the generic caps. Daily/RPD quotas fall back to the documented
 * midnight-Pacific reset when no exact reset hint is present.
 */

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
  const identifiers = [
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


function classify(error) {
  const status = error.response?.status;
  const apiMessage = String(error.response?.data?.error?.message || error.message || '');
  const lowerMessage = apiMessage.toLowerCase();
  const details = getErrorDetails(error);
  const metadata = getErrorInfoMetadata(error);

  if (isTimeoutError(error)) {
    return { classification: 'timeout', retryable: true, failoverKey: true };
  }

  if (status === 401 || status === 403 || /api key not valid|invalid api key|permission denied/i.test(lowerMessage)) {
    return { classification: 'invalid', retryable: false, failoverKey: true, permanentForKey: true };
  }

  if (status === 429 || /quota exceeded|rate limit exceeded|resource exhausted|too many requests/i.test(lowerMessage)) {
    const daily = quotaLooksDaily(error);
    const quotaResetAt = extractQuotaResetAt(error);
    const retryAfterMs = extractRetryDelayMs(error);
    const resetAt = daily
      ? (quotaResetAt || (retryAfterMs > 0 ? Date.now() + retryAfterMs : nextMidnightPacificMs()))
      : quotaResetAt;

    return {
      classification: daily ? 'quota_exceeded' : 'rate_limit',
      retryable: true,
      failoverKey: true,
      retryAfterMs,
      quotaResetAt: resetAt || 0,
      quotaMetadata: metadata,
      rawDetails: details,
    };
  }

  if (status === 503 || /overloaded|high demand|temporarily unavailable|model is currently unavailable/i.test(lowerMessage)) {
    return { classification: 'capacity', retryable: true, failoverKey: true };
  }

  if (status === 500 || status === 502) {
    return { classification: 'transient', retryable: true, failoverKey: true };
  }

  if (status === 408 || status === 504) {
    return { classification: 'timeout', retryable: true, failoverKey: true };
  }

  if (isNetworkResetError(error) || /econnreset|network error|socket hang up|broken pipe/i.test(lowerMessage)) {
    return { classification: 'transient', retryable: true, failoverKey: true };
  }

  if (status === 400 || /invalid argument|malformed request|unsupported model|not found/i.test(lowerMessage)) {
    return { classification: 'permanent', retryable: false, failoverKey: false };
  }

  return { classification: 'unknown', retryable: true, failoverKey: true };
}

const COOLDOWN_STEPS_MS = [2000, 5000, 15000, 30000, 60000];

function cooldownForFailure(consecutiveFailures, classification, retryAfterMs = 0) {
  if (classification === 'invalid' || classification === 'permanent' || classification === 'quota_exceeded') return 0;

  if (classification === 'rate_limit') {
    const baseRaw = Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MS || '5000', 10);
    const maxRaw = Number.parseInt(process.env.GEMINI_RATE_LIMIT_COOLDOWN_MAX_MS || '60000', 10);
    const base = Number.isFinite(baseRaw) && baseRaw > 0 ? baseRaw : 5000;
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 60000;
    const exponential = base * (2 ** Math.max(0, consecutiveFailures - 1));
    return Math.min(Math.max(exponential, retryAfterMs || 0), max);
  }

  const maxRaw = Number.parseInt(process.env.GEMINI_POOL_MAX_COOLDOWN_MS || '300000', 10);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 300000;
  const stepIndex = Math.min(Math.max(consecutiveFailures - 1, 0), COOLDOWN_STEPS_MS.length - 1);
  const base = COOLDOWN_STEPS_MS[stepIndex];
  const jitter = Math.floor(base * 0.2 * Math.random());
  return Math.min(base + jitter, max);
}

module.exports = {
  classify,
  cooldownForFailure,
  isTimeoutError,
  extractRetryDelayMs,
  extractQuotaResetAt,
  quotaLooksDaily,
};
