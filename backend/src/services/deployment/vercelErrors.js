'use strict';

/**
 * Maps raw Vercel API / network failures to a small, stable vocabulary the
 * rest of the deployment-management code (and the UI) can act on. Messages
 * are user-safe: they never include tokens, headers or raw response bodies.
 * Everything DevDrop does against these endpoints is read-only.
 */

const CODES = Object.freeze({
  PLAN_RESTRICTION: 'PLAN_RESTRICTION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  AUTH_REJECTED: 'AUTH_REJECTED',
  NOT_FOUND: 'NOT_FOUND',
  GONE: 'GONE',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
});

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND']);

const providerMessage = (error) => {
  const raw = error?.response?.data?.error?.message || error?.response?.data?.message || '';
  return typeof raw === 'string' ? raw.slice(0, 300) : '';
};

const retryAfterMs = (error) => {
  const header = error?.response?.headers?.['retry-after'];
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 300) * 1000 : null;
};

/**
 * @param {Error} error  axios error (or any thrown value)
 * @returns {{code:string, httpStatus:(number|null), message:string, retryable:boolean, retryAfterMs:(number|null)}}
 */
const classifyVercelError = (error) => {
  const status = error?.response?.status || error?.status || null;
  const detail = providerMessage(error);
  const base = { httpStatus: status, retryAfterMs: retryAfterMs(error) };

  if (status === 402) {
    return { ...base, code: CODES.PLAN_RESTRICTION, message: 'Your Vercel plan does not allow this request.', retryable: false };
  }
  if (status === 401) {
    return { ...base, code: CODES.AUTH_REJECTED, message: 'Vercel rejected DevDrop\'s connection. Reconnect Vercel under Connected Accounts and try again.', retryable: false };
  }
  if (status === 403) {
    return { ...base, code: CODES.PERMISSION_DENIED, message: 'Vercel denied permission. The connected Vercel account/integration needs access to this project.', retryable: false };
  }
  if (status === 404) {
    return { ...base, code: CODES.NOT_FOUND, message: 'Vercel could not find that project or deployment. It may have been deleted.', retryable: false };
  }
  if (status === 410) {
    return { ...base, code: CODES.GONE, message: 'That deployment is no longer available on Vercel (expired or deleted).', retryable: false };
  }
  if (status === 429) {
    return { ...base, code: CODES.RATE_LIMITED, message: 'Vercel is rate-limiting requests. Please wait a moment and try again.', retryable: true };
  }
  if (status === 400) {
    return { ...base, code: CODES.INVALID_REQUEST, message: `Vercel rejected the request${detail ? `: ${detail}` : '.'}`, retryable: false };
  }
  if (status && status >= 500) {
    return { ...base, code: CODES.UPSTREAM_ERROR, message: 'Vercel returned a server error.', retryable: true };
  }

  const code = error?.code;
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(String(error?.message || ''))) {
    return { ...base, code: CODES.TIMEOUT, message: 'The request to Vercel timed out.', retryable: true };
  }
  if (NETWORK_CODES.has(code)) {
    return { ...base, code: CODES.NETWORK, message: 'DevDrop could not reach Vercel.', retryable: true };
  }
  return { ...base, code: CODES.UPSTREAM_ERROR, message: 'Unexpected error talking to Vercel.', retryable: true };
};

/** Error carrying the classified shape so callers can branch on `.vercel.code`. */
class VercelRequestError extends Error {
  constructor(classified, cause) {
    super(classified.message);
    this.name = 'VercelRequestError';
    this.provider = 'vercel';
    this.vercel = classified;
    this.status = classified.httpStatus || undefined;
    if (cause) this.cause = cause;
  }
}

module.exports = { CODES, classifyVercelError, VercelRequestError };
