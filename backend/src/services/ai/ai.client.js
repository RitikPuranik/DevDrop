const axios = require('axios');

/**
 * Internal client for the DevDrop AI service (FastAPI, Phases 1-5).
 *
 * This is the ONLY place in the Node codebase that talks to the AI
 * service directly. Controllers must go through the functions exported
 * here rather than calling axios/fetch against AI_SERVICE_URL themselves,
 * so auth headers, timeouts, and error shapes stay consistent in one spot.
 *
 * The AI service's own auth guard (dependencies.require_service_auth)
 * reads a shared secret from the `X-Service-Auth` header. If
 * AI_SERVICE_AUTH_TOKEN isn't set here, we simply don't send the header —
 * matching the AI service's own "stays open in local dev" behavior.
 */

const DEFAULT_TIMEOUT_MS = 20000;

const getBaseUrl = () => {
  if (!process.env.AI_SERVICE_URL) {
    throw new AiServiceConfigError('AI_SERVICE_URL is not configured.');
  }
  return process.env.AI_SERVICE_URL.replace(/\/+$/, '');
};

const isAiServiceConfigured = () => Boolean(process.env.AI_SERVICE_URL);

class AiServiceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiServiceConfigError';
  }
}

/**
 * Normalized error thrown by every function in this client. Controllers
 * can rely on `.status` (a safe HTTP status to forward) and `.code` /
 * `.message` (safe to show the user) without ever touching axios/FastAPI
 * internals directly.
 */
class AiServiceError extends Error {
  constructor({ status, code, message, stage }) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
    this.code = code;
    this.stage = stage || null;
  }
}

const buildHeaders = (extra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (process.env.AI_SERVICE_AUTH_TOKEN) {
    headers['X-Service-Auth'] = process.env.AI_SERVICE_AUTH_TOKEN;
  }
  return headers;
};

/**
 * Maps any failure (network, timeout, non-2xx, malformed body) into an
 * AiServiceError so callers never see raw axios/Python error internals.
 */
const normalizeError = (error) => {
  if (error instanceof AiServiceConfigError) {
    return new AiServiceError({
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'The AI generation service is not configured.',
    });
  }

  if (error.code === 'ECONNABORTED') {
    return new AiServiceError({
      status: 504,
      code: 'AI_SERVICE_TIMEOUT',
      message: 'The AI generation service took too long to respond.',
    });
  }

  if (!error.response) {
    // DNS failure, connection refused, socket hang up, etc.
    return new AiServiceError({
      status: 502,
      code: 'AI_SERVICE_UNREACHABLE',
      message: 'Could not reach the AI generation service.',
    });
  }

  const { status, data } = error.response;
  const body = typeof data === 'object' && data !== null ? data : {};
  const errorBody = body.error && typeof body.error === 'object' ? body.error : {};

  return new AiServiceError({
    status: status >= 400 && status < 600 ? status : 502,
    code: errorBody.code || body.code || 'AI_SERVICE_ERROR',
    message: errorBody.message || body.message || 'The AI generation service returned an error.',
    stage: errorBody.stage || null,
  });
};

const request = async ({ method, path, data, params, headers, timeout }) => {
  try {
    const response = await axios({
      method,
      url: `${getBaseUrl()}${path}`,
      data,
      params,
      timeout: timeout || DEFAULT_TIMEOUT_MS,
      headers: buildHeaders(headers),
    });
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

// POST /v1/generation/jobs runs the ENTIRE generation pipeline (planning,
// code generation, sandboxed npm install + build, and any debug/repair
// loop) synchronously before responding — it is not a fire-and-forget
// "queue a job" call. That can legitimately take up to
// MAX_GENERATION_DURATION_SECONDS (ai-service/.env, default 600s), so this
// call needs a much longer timeout than the 20s default used for quick
// status lookups (getGenerationJob/getProject) — otherwise the axios
// request aborts with ECONNABORTED long before the AI service is actually
// done, even though the pipeline itself is working fine.
const GENERATION_TIMEOUT_MS = 620_000; // 10 minutes + 20s buffer

/**
 * Creates a generation job for a portfolio website.
 * Mirrors POST /v1/generation/jobs on the AI service.
 *
 * @param {object} payload - PortfolioPlanningRequest-shaped body
 *   ({ websiteType, userData, preferences }).
 * @param {object} options
 * @param {string} options.ownerId - DevDrop user id, forwarded as
 *   X-Owner-Id so the AI service can tag the job/project with ownership
 *   context (Section 23/24 — minimum ownership context only).
 * @param {string} [options.idempotencyKey] - Prevents duplicate jobs on
 *   accidental retry/double-submit (Section 22).
 */
const createGenerationJob = async (payload, { ownerId, idempotencyKey } = {}) => {
  return request({
    method: 'post',
    path: '/v1/generation/jobs',
    data: payload,
    timeout: GENERATION_TIMEOUT_MS,
    headers: {
      ...(ownerId ? { 'X-Owner-Id': String(ownerId) } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  });
};

/**
 * Fetches current job status/stage. Mirrors
 * GET /v1/generation/jobs/{jobId}.
 */
const getGenerationJob = async (jobId) => {
  return request({ method: 'get', path: `/v1/generation/jobs/${encodeURIComponent(jobId)}` });
};

/**
 * Fetches a generated project's metadata + files. Only called when the
 * user actually opens the project (Section 41 — never during polling).
 */
const getProject = async (projectId) => {
  return request({ method: 'get', path: `/v1/projects/${encodeURIComponent(projectId)}` });
};

module.exports = {
  createGenerationJob,
  getGenerationJob,
  getProject,
  isAiServiceConfigured,
  AiServiceError,
};