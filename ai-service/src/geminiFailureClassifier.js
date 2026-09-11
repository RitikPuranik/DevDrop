/**
 * Classifies an error from a Gemini request into one of a small set of
 * buckets so geminiPool.service.js knows whether to fail the key over,
 * cool it down, or mark it permanently invalid. Kept separate from
 * gemini.service.js's model-level retry logic (MAX_TOKENS / malformed
 * JSON handling), which is a different, orthogonal concern.
 *
 * classification:
 *  - 'invalid'     permanent — bad/revoked key, never retry this key
 *  - 'rate_limit'  quota/429 — cooldown, try another key immediately
 *  - 'capacity'    503/overloaded — cooldown (shorter), try another key
 *  - 'timeout'     network/provider timeout — try another key, short cooldown
 *  - 'transient'   5xx/network blip — try another key, short cooldown
 *  - 'permanent'   malformed request/unsupported model/etc — do not retry
 *                  this key OR failover (the request itself is bad)
 */

const isTimeoutError = (error) =>
  error.code === 'ECONNABORTED' ||
  error.code === 'ETIMEDOUT' ||
  /timeout of \d+ms exceeded/i.test(error.message || '');

const isNetworkResetError = (error) =>
  ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);

function classify(error) {
  const status = error.response?.status;
  const apiMessage = String(error.response?.data?.error?.message || error.message || '');
  const lowerMessage = apiMessage.toLowerCase();

  if (isTimeoutError(error)) {
    return { classification: 'timeout', retryable: true, failoverKey: true };
  }

  if (status === 401 || status === 403 || /api key not valid|invalid api key|permission denied/i.test(lowerMessage)) {
    return { classification: 'invalid', retryable: false, failoverKey: true, permanentForKey: true };
  }

  if (
    status === 429 ||
    /quota exceeded|rate limit exceeded|resource exhausted/i.test(lowerMessage)
  ) {
    return { classification: 'rate_limit', retryable: true, failoverKey: true };
  }

  if (
    status === 503 ||
    /overloaded|high demand|temporarily unavailable|model is currently unavailable/i.test(lowerMessage)
  ) {
    return { classification: 'capacity', retryable: true, failoverKey: true };
  }

  if (status === 500 || status === 502) {
    return { classification: 'transient', retryable: true, failoverKey: true };
  }

  if (status === 408 || status === 504) {
    return { classification: 'timeout', retryable: true, failoverKey: true };
  }

  if (isNetworkResetError(error) || /econnreset|network error|socket hang up/i.test(lowerMessage)) {
    return { classification: 'transient', retryable: true, failoverKey: true };
  }

  if (
    status === 400 ||
    /invalid argument|malformed request|unsupported model|not found/i.test(lowerMessage)
  ) {
    return { classification: 'permanent', retryable: false, failoverKey: false };
  }

  // Unknown error shape — be conservative: allow one failover to another
  // key, but don't loop forever on it.
  return { classification: 'unknown', retryable: true, failoverKey: true };
}

/**
 * Exponential backoff with jitter, per spec's example table (2s, 5s, 15s,
 * 30s, 60s...), capped by GEMINI_POOL_MAX_COOLDOWN_MS.
 */
const COOLDOWN_STEPS_MS = [2000, 5000, 15000, 30000, 60000];

function cooldownForFailure(consecutiveFailures, classification) {
  const maxCooldown = Number.parseInt(process.env.GEMINI_POOL_MAX_COOLDOWN_MS || '300000', 10);

  if (classification === 'invalid' || classification === 'permanent') return 0; // not a cooldown, it's a hard stop/no-op

  const stepIndex = Math.min(Math.max(consecutiveFailures - 1, 0), COOLDOWN_STEPS_MS.length - 1);
  const base = COOLDOWN_STEPS_MS[stepIndex];
  const jitter = Math.floor(base * 0.2 * Math.random());
  return Math.min(base + jitter, maxCooldown);
}

module.exports = { classify, cooldownForFailure, isTimeoutError };
