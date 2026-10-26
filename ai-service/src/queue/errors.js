'use strict';

const FAILURE = Object.freeze({ TRANSIENT: 'transient', QUOTA: 'quota', PERMANENT: 'permanent' });
const TRANSIENT_NET = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND']);

// quota     -> provider pools exhausted / 429: delay the job, never hammer the pool
// transient -> network or 5xx: bounded retry with exponential backoff
// permanent -> invalid input, validation/build failures, unknown logic errors: never retried
function classifyError(error) {
  if (!error) return FAILURE.PERMANENT;
  if (error.failureClass && Object.values(FAILURE).includes(error.failureClass)) return error.failureClass;
  // A pool that is exhausted for a non-temporary reason (invalid credentials, bad request) will not recover by waiting.
  if (error.code === 'GEMINI_POOL_EXHAUSTED' || error.code === 'GROQ_POOL_EXHAUSTED') return error.temporary === false ? FAILURE.PERMANENT : FAILURE.QUOTA;

  const status = error.status || error.statusCode || error.response?.status;
  if (status === 429) return FAILURE.QUOTA;
  if (status >= 500 || status === 408) return FAILURE.TRANSIENT;
  if (TRANSIENT_NET.has(error.code)) return FAILURE.TRANSIENT;

  const message = String(error.message || '');
  if (/gemini pool exhausted|temporarily at capacity|all gemini keys are temporarily unavailable|quota/i.test(message)) return FAILURE.QUOTA;
  if (/timeout|socket hang up|network error/i.test(message) && error.failure?.category !== 'timeout') return FAILURE.TRANSIENT;
  return FAILURE.PERMANENT;
}

module.exports = { FAILURE, classifyError };
