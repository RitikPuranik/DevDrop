const axios = require('axios');

/**
 * Render deployment provider.
 *
 * Render uses personal API keys for API access. Keys are stored encrypted in
 * DevDrop and are only decrypted server-side for provider calls.
 */

const BASE_URL = 'https://api.render.com/v1';
const DEFAULT_REGION = process.env.RENDER_DEFAULT_REGION || 'oregon';
const DEFAULT_PLAN = process.env.RENDER_DEFAULT_PLAN || 'free';

const isConfigured = () => true;

const renderApi = (apiKey) => axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  timeout: 30000,
});

const describeError = (error) => error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unknown Render API error';
const wrapError = (error, context) => {
  const err = new Error(context ? `Render error ${context}: ${describeError(error)}` : `Render error: ${describeError(error)}`);
  err.provider = 'render';
  err.status = error?.response?.status;
  return err;
};

const listOwners = async (apiKey) => {
  try {
    const { data } = await renderApi(apiKey).get('/owners', { params: { limit: 100 } });
    const entries = Array.isArray(data) ? data : data?.owners || [];
    return entries.map((entry) => entry.owner || entry).map((owner) => ({
      id: owner.id,
      name: owner.name || owner.email,
      type: owner.type,
    }));
  } catch (error) {
    throw wrapError(error, 'listing workspaces');
  }
};

const listServices = async (apiKey, ownerId) => {
  try {
    const { data } = await renderApi(apiKey).get('/services', {
      params: { ownerId: [ownerId], limit: 100, includePreviews: false },
    });
    const entries = Array.isArray(data) ? data : data?.services || [];
    return entries.map((entry) => entry.service || entry).map((service) => ({
      id: service.id,
      name: service.name,
      type: service.type,
      repo: service.repo || null,
      branch: service.branch || null,
      url: service.serviceDetails?.url || service.url || null,
    }));
  } catch (error) {
    throw wrapError(error, 'listing services');
  }
};

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
      const service = data.service || data;
      return { serviceId: service.id, serviceName: service.name, url: service.serviceDetails?.url || service.url || null };
    } catch (error) {
      if (error?.response?.status !== 404) throw wrapError(error, 'looking up existing service');
    }
  }

  if (!metadata?.ownerId) {
    throw Object.assign(new Error('No Render workspace selected for this connection yet.'), { provider: 'render', status: 400 });
  }

  try {
    const body = {
      type: 'web_service',
      name: config.serviceName,
      ownerId: metadata.ownerId,
      repo: `https://github.com/${config.repoOwner}/${config.repoName}`,
      branch: config.branch || 'main',
      autoDeploy: 'yes',
      serviceDetails: {
        env: 'node',
        region: DEFAULT_REGION,
        plan: DEFAULT_PLAN,
        envSpecificDetails: {
          buildCommand: config.buildCommand || 'npm install',
          startCommand: config.startCommand || 'npm start',
        },
      },
    };
    if (config.rootDirectory) body.rootDir = config.rootDirectory;

    const { data } = await api.post('/services', body);
    const service = data.service || data;
    return { serviceId: service.id, serviceName: service.name, url: service.serviceDetails?.url || service.url || null };
  } catch (error) {
    throw wrapError(error, 'creating service');
  }
};

/** Render replaces the complete environment-variable list on this endpoint. */
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
    const deployment = data.deploy || data;
    return { deployId: deployment.id };
  } catch (error) {
    throw wrapError(error, 'triggering deployment');
  }
};

const TERMINAL_SUCCESS = new Set(['live']);
const TERMINAL_FAILURE = new Set(['build_failed', 'update_failed', 'canceled', 'pre_deploy_failed', 'deactivated']);

const getDeploymentStatus = async (credential, metadata, serviceId, deployId) => {
  const api = renderApi(credential);
  try {
    const { data } = await api.get(`/services/${serviceId}/deploys/${deployId}`);
    const state = data.status;
    const isSuccess = TERMINAL_SUCCESS.has(state);
    const isTerminal = isSuccess || TERMINAL_FAILURE.has(state);

    let url = null;
    if (isSuccess) {
      const { data: response } = await api.get(`/services/${serviceId}`);
      const service = response.service || response;
      url = service.serviceDetails?.url || service.url || null;
    }

    return { state, isTerminal, isSuccess, url };
  } catch (error) {
    throw wrapError(error, 'checking deployment status');
  }
};

module.exports = {
  isConfigured,
  listOwners,
  listServices,
  validateConnection,
  ensureProject,
  configureEnvironment,
  deploy,
  getDeploymentStatus,
};
