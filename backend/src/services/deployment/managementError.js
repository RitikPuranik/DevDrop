'use strict';

/**
 * Error thrown by the deployment-management services. Carries an HTTP-ish
 * status and a stable machine code so controllers/UI can react without
 * parsing messages. Messages are always user-safe.
 */
class ManagementError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'ManagementError';
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

const STATUS_BY_VERCEL_CODE = {
  PLAN_RESTRICTION: 422,
  PERMISSION_DENIED: 403,
  AUTH_REJECTED: 502, // never surface an upstream 401 as ours: the frontend treats 401 as a DevDrop session problem
  NOT_FOUND: 404,
  GONE: 410,
  CONFLICT: 409,
  NOT_ELIGIBLE: 422,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 502,
};

/** Converts a VercelRequestError (see vercelErrors.js) into a ManagementError with a DevDrop-safe status. */
const fromVercelError = (error) => {
  if (error instanceof ManagementError) return error;
  const v = error?.vercel;
  if (!v) return new ManagementError(502, 'VERCEL_UNAVAILABLE', 'DevDrop could not complete the request to Vercel.', { retryable: true });
  return new ManagementError(STATUS_BY_VERCEL_CODE[v.code] || 502, `VERCEL_${v.code}`, v.message, {
    retryable: v.retryable,
    retryAfterMs: v.retryAfterMs || undefined,
  });
};

module.exports = { ManagementError, fromVercelError };
