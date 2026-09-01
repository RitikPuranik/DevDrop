const axios = require('axios');

/**
 * Render deployment provider.
 *
 * Render's current API is authenticated with a personal API key
 * (`Authorization: Bearer <key>`) — there is no OAuth flow for the
 * operations DevDrop needs (creating services, setting env vars, deploying).
 * So "connecting" Render is: the user generates an API key from their own
 * Render dashboard (Account Settings → API Keys) and pastes it into
 * DevDrop; we validate it against `GET /v1/owners` and store it encrypted,
 * the same as any other provider credential.
 *
 * A single API key can see every workspace ("owner") the user belongs to,
 * so `metadata.ownerId` records which one DevDrop should create services
 * in — analogous to Vercel's teamId.
 *
 * IMPORTANT: `PUT /v1/services/:id/env-vars` fully REPLACES the service's
 * environment variables (it's not a merge/patch). Callers of
 * configureEnvironment must always pass the complete desired set, not just
 * what changed since the last call — the orchestrator does this by keeping
 * the accumulated variable list rather than sending deltas.
 */

const BASE_URL = 'https://api.render.com/v1';
const DEFAULT_REGION = process.env.RENDER_DEFAULT_REGION || 'oregon';
const DEFAULT_PLAN = process.env.RENDER_DEFAULT_PLAN || 'free';

// Render needs no app-level registration (unlike Vercel/GitHub OAuth apps) —
// every user brings their own API key, so there's nothing to "configure"
// server-wide beyond the optional region/plan defaults above.
const isConfigured = () => true;

const renderApi = (apiKey) =>
  axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

const describeError = (error) => error?.response?.data?.message || error?.message || 'Unknown Render API error';
const wrapError = (error, context) => {
  const err = new Error(context ? `Render error ${context}: ${describeError(error)}` : `Render error: ${describeError(error)}`);
  err.provider = 'render';
  err.status = error?.response?.status;
  return err;
};

/** Confirms an API key works and lists the workspaces it can act on.
 * Called both when the user first pastes a key in, and defensively before
 * each deployment run. */
const listOwners = async (apiKey) => {
  const { data } = await renderApi(apiKey).get('/owners', { params: { limit: 100 } });
  // Render list endpoints wrap each item, e.g. [{ owner: {...} }, ...].
  return (Array.isArray(data) ? data : []).map((entry) => entry.owner || entry).map((owner) => ({
    id: owner.id,
    name: owner.name || owner.email,
    type: owner.type,
  }));
};

// --- Provider interface implementation (see provider.interface.js) ---

const validateConnection = async (credential, metadata) => {
  try {
    const owners = await listOwners(credential);
    const current = owners.find((o) => o.id === metadata?.ownerId) || owners[0];
    return { ok: true, accountLabel: current?.name || 'Render account', owners };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
};

const ensureProject = async (credential, metadata, config, existing) => {
  const api = renderApi(credential);

  if (existing?.serviceId) {
    try {
      const { data } = await api.get(`/services/${existing.serviceId}`);
      return { serviceId: data.id, serviceName: data.name, url: data.serviceDetails?.url || null };
    } catch (error) {
      if (error?.response?.status !== 404) throw wrapError(error, 'looking up existing service');
      // Service was deleted on Render's side since we last saw it — recreate below.
    }
  }

  if (!metadata?.ownerId) {
    throw new Error('No Render workspace selected for this connection yet.');
  }

  try {
    const { data } = await api.post('/services', {
      type: 'web_service',
      name: config.serviceName,
      ownerId: metadata.ownerId,
      repo: `https://github.com/${config.repoOwner}/${config.repoName}`,
      branch: config.branch || 'main',
      autoDeploy: 'yes',
      rootDir: config.rootDirectory || undefined,
      serviceDetails: {
        env: 'node',
        region: DEFAULT_REGION,
        plan: DEFAULT_PLAN,
        envSpecificDetails: {
          buildCommand: config.buildCommand || 'npm install',
          startCommand: config.startCommand,
        },
      },
    });
    return { serviceId: data.id, serviceName: data.name, url: data.serviceDetails?.url || null };
  } catch (error) {
    throw wrapError(error, 'creating service');
  }
};

/** Full replace, per Render's API — see the file-level note above. */
const configureEnvironment = async (credential, metadata, serviceId, variables) => {
  try {
    await renderApi(credential).put(
      `/services/${serviceId}/env-vars`,
      variables.map((v) => ({ key: v.key, value: v.value }))
    );
  } catch (error) {
    throw wrapError(error, 'setting environment variables');
  }
};

const deploy = async (credential, metadata, service) => {
  try {
    const { data } = await renderApi(credential).post(`/services/${service.serviceId}/deploys`, {
      clearCache: 'do_not_clear',
    });
    return { deployId: data.id };
  } catch (error) {
    throw wrapError(error, 'triggering deployment');
  }
};

const TERMINAL_SUCCESS = new Set(['live']);
const TERMINAL_FAILURE = new Set(['build_failed', 'update_failed', 'canceled', 'pre_deploy_failed', 'deactivated']);

const getDeploymentStatus = async (credential, metadata, serviceId, deployId) => {
  const api = renderApi(credential);
  const { data } = await api.get(`/services/${serviceId}/deploys/${deployId}`);
  const state = data.status;
  const isSuccess = TERMINAL_SUCCESS.has(state);
  const isTerminal = isSuccess || TERMINAL_FAILURE.has(state);

  let url = null;
  if (isSuccess) {
    const { data: service } = await api.get(`/services/${serviceId}`);
    url = service.serviceDetails?.url || null;
  }

  return { state, isTerminal, isSuccess, url };
};

module.exports = {
  isConfigured,
  listOwners,
  validateConnection,
  ensureProject,
  configureEnvironment,
  deploy,
  getDeploymentStatus,
};
