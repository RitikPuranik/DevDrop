'use strict';

const { UnrecoverableError } = require('bullmq');

// Failure classification used by every processor.
//   transient  -> retry with exponential backoff (bounded by `attempts`)
//   quota      -> AI provider quota exhausted: delay, do not burn an attempt
//   permanent  -> never retry
const FAILURE = Object.freeze({ TRANSIENT: 'transient', QUOTA: 'quota', PERMANENT: 'permanent' });

const TRANSIENT_NET = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND']);

const classifyError = (error) => {
  if (!error) return FAILURE.PERMANENT;
  if (error.failureClass && Object.values(FAILURE).includes(error.failureClass)) return error.failureClass;
  if (error.code === 'GEMINI_POOL_EXHAUSTED' || error.code === 'GROQ_POOL_EXHAUSTED') return FAILURE.QUOTA;

  const status = error.status || error.statusCode || error.response?.status;
  if (status === 429) return FAILURE.QUOTA;
  if (status >= 500 || status === 408) return FAILURE.TRANSIENT;
  if (status >= 400 && status < 500) return FAILURE.PERMANENT;
  if (TRANSIENT_NET.has(error.code)) return FAILURE.TRANSIENT;
  if (/timeout|socket hang up|network error/i.test(String(error.message || ''))) return FAILURE.TRANSIENT;
  return FAILURE.PERMANENT;
};

const permanent = (message, code) => {
  const err = new UnrecoverableError(message);
  err.code = code || 'PERMANENT_FAILURE';
  err.failureClass = FAILURE.PERMANENT;
  return err;
};

// Strips anything that could carry secrets before it is persisted or logged.
const sanitizeError = (error) => {
  const raw = String(error?.userMessage || error?.message || 'Job failed');
  const message = raw
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/(api[_-]?key|token|secret|password|authorization)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[redacted]')
    .replace(/rediss?:\/\/[^\s]+/gi, '[redis-url]')
    .slice(0, 500);
  return { code: error?.code ? String(error.code).slice(0, 60) : undefined, message, class: classifyError(error) };
};

module.exports = { FAILURE, classifyError, permanent, sanitizeError, UnrecoverableError };
