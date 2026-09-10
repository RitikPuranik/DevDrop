const axios = require('axios');

/**
 * Internal client for the DevDrop ai-service microservice (Genie engine)
 * (https://github.com/fozagtx/genie, vendored at /services/genie).
 *
 * This is the ONLY place in the Node codebase that talks to the ai-service
 * directly. Controllers must go through the functions exported here
 * rather than calling axios/fetch against AI_SERVICE_URL themselves,
 * so auth headers, timeouts, and error shapes stay consistent in one spot.
 *
 * Genie's own auth (services/genie/src/api/middleware/supabaseAuth.ts ->
 * optionalAuth, patched for this integration) trusts a request as coming
 * from an already-authenticated DevDrop user when it carries:
 *   - X-Service-Key: shared secret (AI_SERVICE_TOKEN / SERVICE_API_KEY)
 *   - X-User-Id: the DevDrop user id DevDrop has already verified
 * Genie never sees a DevDrop session token or password.
 */

const DEFAULT_TIMEOUT_MS = 30000;

class GenieServiceConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GenieServiceConfigError';
  }
}

/**
 * Normalized error thrown by every function in this client. Controllers
 * can rely on `.status` (a safe HTTP status to forward) and `.code` /
 * `.message` (safe to show the user) without ever touching axios/Genie
 * internals directly.
 */
class GenieServiceError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'GenieServiceError';
    this.status = status;
    this.code = code;
  }
}

const getBaseUrl = () => {
  if (!process.env.AI_SERVICE_URL) {
    throw new GenieServiceConfigError('AI_SERVICE_URL is not configured.');
  }
  return process.env.AI_SERVICE_URL.replace(/\/+$/, '');
};

const isGenieConfigured = () => Boolean(process.env.AI_SERVICE_URL);

const buildHeaders = (ownerId, extra = {}) => {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (process.env.AI_SERVICE_TOKEN) {
    headers['X-Service-Key'] = process.env.AI_SERVICE_TOKEN;
  }
  if (ownerId) {
    headers['X-User-Id'] = String(ownerId);
  }
  return headers;
};

/**
 * Maps any failure (network, timeout, non-2xx, malformed body) into a
 * GenieServiceError so callers never see raw axios/Genie internals.
 */
const normalizeError = (error) => {
  if (error instanceof GenieServiceConfigError) {
    return new GenieServiceError({
      status: 503,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'The AI generation service is not configured.',
    });
  }

  if (error.code === 'ECONNABORTED') {
    return new GenieServiceError({
      status: 504,
      code: 'AI_SERVICE_TIMEOUT',
      message: 'The AI generation service took too long to respond.',
    });
  }

  if (!error.response) {
    // DNS failure, connection refused, socket hang up, etc.
    return new GenieServiceError({
      status: 502,
      code: 'AI_SERVICE_UNREACHABLE',
      message: 'Could not reach the AI generation service.',
    });
  }

  const { status, data } = error.response;
  const body = typeof data === 'object' && data !== null ? data : {};

  return new GenieServiceError({
    status: status >= 400 && status < 600 ? status : 502,
    code: body.code || (status === 401 || status === 403 ? 'AI_SERVICE_AUTH_ERROR' : 'AI_SERVICE_ERROR'),
    message: body.error || body.message || 'The AI generation service returned an error.',
  });
};

const request = async ({ method, path, data, params, ownerId, headers }) => {
  try {
    const response = await axios({
      method,
      url: `${getBaseUrl()}${path}`,
      data,
      params,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: buildHeaders(ownerId, headers),
    });
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
};

/**
 * Creates a generation job. Mirrors POST /api/generate on Genie.
 * Only forwards fields Genie's generateRequestSchema actually accepts.
 *
 * @param {object} payload
 * @param {string} payload.prompt - required
 * @param {string} [payload.projectContext] - existing files/summary, used
 *   for iterative edits (Section 5).
 * @param {string} [payload.targetLanguage]
 * @param {('simple'|'moderate'|'complex')} [payload.complexity]
 * @param {string[]} [payload.imageUrls]
 * @param {boolean} [payload.autoPreview]
 * @param {object} options
 * @param {string} options.ownerId - DevDrop user id, forwarded as X-User-Id.
 */
const createGeneration = async (payload, { ownerId } = {}) => {
  return request({ method: 'post', path: '/api/generate', data: payload, ownerId });
};

/**
 * Fetches a generation's status/result. Mirrors GET /api/generate/:id.
 * `full=true` also returns the generated files — only requested when the
 * job is actually complete/failed or the caller needs files to continue a
 * chat-based modification (Section 41-equivalent: don't fetch files on
 * every poll).
 */
const getGeneration = async (generationId, { ownerId, full = false } = {}) => {
  return request({
    method: 'get',
    path: `/api/generate/${encodeURIComponent(generationId)}`,
    params: full ? { full: 'true' } : undefined,
    ownerId,
  });
};

/**
 * Sends a follow-up modification message against an existing generation.
 * Mirrors POST /api/chat. `currentFiles` must be the generated project's
 * current file set so Genie modifies the existing project instead of
 * starting a new one (Section 5).
 */
const sendChatMessage = async ({ generationId, message, currentFiles, imageUrls }, { ownerId } = {}) => {
  return request({
    method: 'post',
    path: '/api/chat',
    data: { generationId, message, currentFiles: currentFiles || [], imageUrls },
    ownerId,
  });
};

/**
 * Fetches a chat (edit) job's status/result. Mirrors GET /api/chat/:jobId.
 * `/api/chat` itself only enqueues the edit and returns a job id
 * immediately — the actual applied files (or error) only show up here,
 * once Genie's ChatQueue finishes processing the job.
 */
const getChatJob = async (chatJobId, { ownerId } = {}) => {
  return request({
    method: 'get',
    path: `/api/chat/${encodeURIComponent(chatJobId)}`,
    ownerId,
  });
};

/**
 * Health check. Mirrors Genie's own GET /api/status. No auth required.
 */
const checkHealth = async () => {
  return request({ method: 'get', path: '/api/status' });
};

module.exports = {
  createGeneration,
  getGeneration,
  sendChatMessage,
  getChatJob,
  checkHealth,
  isGenieConfigured,
  GenieServiceError,
};
