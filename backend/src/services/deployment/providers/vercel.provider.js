const axios = require('axios');
const jwt = require('jsonwebtoken');

/**
 * Vercel deployment provider.
 *
 * Vercel Integration Console installations use the external installation
 * flow: /integrations/:slug/new. Vercel sends `code`, `teamId`,
 * `configurationId`, `state` and `next` back to the configured redirect URL.
 * The `code` is exchanged server-side for a long-lived access token.
 *
 * IMPORTANT: `configurationId` is retained because it identifies the exact
 * installation/configuration whose project permissions were selected by the
 * user. `state` is also used to bind the callback to the DevDrop user who
 * started the connection.
 */

const getClientId = () => {
  if (!process.env.VERCEL_CLIENT_ID) throw new Error('VERCEL_CLIENT_ID is not configured.');
  return process.env.VERCEL_CLIENT_ID;
};
const getClientSecret = () => {
  if (!process.env.VERCEL_CLIENT_SECRET) throw new Error('VERCEL_CLIENT_SECRET is not configured.');
  return process.env.VERCEL_CLIENT_SECRET;
};
const getRedirectUri = () => {
  if (!process.env.VERCEL_OAUTH_REDIRECT_URI) throw new Error('VERCEL_OAUTH_REDIRECT_URI is not configured.');
  return process.env.VERCEL_OAUTH_REDIRECT_URI;
};
const getIntegrationSlug = () => {
  if (!process.env.VERCEL_INTEGRATION_SLUG) throw new Error('VERCEL_INTEGRATION_SLUG is not configured.');
  return process.env.VERCEL_INTEGRATION_SLUG;
};

const isConfigured = () =>
  Boolean(
    process.env.VERCEL_CLIENT_ID &&
      process.env.VERCEL_CLIENT_SECRET &&
      process.env.VERCEL_OAUTH_REDIRECT_URI &&
      process.env.VERCEL_INTEGRATION_SLUG
  );

const getStateSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
  return process.env.JWT_SECRET;
};

/** Create a short-lived state value bound to the currently authenticated
 * DevDrop user. Vercel's external installation flow returns this state. */
const createConnectState = (userId) => jwt.sign(
  {
    purpose: 'vercel-connect',
    userId: String(userId),
  },
  getStateSecret(),
  { expiresIn: '10m' }
);

const verifyConnectState = (state) => {
  const decoded = jwt.verify(state, getStateSecret());
  if (decoded?.purpose !== 'vercel-connect' || !decoded?.userId) {
    throw new Error('Invalid Vercel connection state.');
  }
  return { userId: String(decoded.userId) };
};

/** Where the "Connect Vercel" button sends the user's browser. The
 * external installation flow explicitly supports `state` and `next`; use
 * them so the callback can be tied to the initiating DevDrop user and the
 * popup knows which page should receive the result. */
const getInstallUrl = ({ state, next } = {}) => {
  const url = new URL(`https://vercel.com/integrations/${getIntegrationSlug()}/new`);
  if (state) url.searchParams.set('state', state);
  if (next) url.searchParams.set('next', next);
  return url.toString();
};

const exchangeCodeForToken = async (code, configurationId) => {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    redirect_uri: getRedirectUri(),
  });

  // IMPORTANT: configurationId identifies the installed configuration, but
  // it is NOT part of Vercel's /v2/oauth/access_token request body. Vercel's
  // documented exchange requires client_id, client_secret, code and
  // redirect_uri. Sending configurationId here can cause the provider to
  // reject an otherwise valid installation. We persist configurationId
  // separately after the exchange.

  try {
    const { data } = await axios.post(
      'https://api.vercel.com/v2/oauth/access_token',
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (!data.access_token) throw new Error('Vercel did not return an access token.');
    return {
      accessToken: data.access_token,
      teamId: data.team_id || null,
      vercelUserId: data.user_id || null,
      installationId: data.installation_id || null,
      configurationId: configurationId || data.configuration_id || null,
    };
  } catch (error) {
    const status = error?.response?.status;
    const providerMessage = error?.response?.data?.error?.message || error?.response?.data?.error || error?.message;
    const err = new Error(providerMessage || 'Vercel token exchange failed.');
    err.status = status || 502;
    err.provider = 'vercel';
    throw err;
  }
};

const vercelApi = (accessToken, teamId) =>
  axios.create({
    baseURL: 'https://api.vercel.com',
    headers: { Authorization: `Bearer ${accessToken}` },
    params: teamId ? { teamId } : undefined,
    timeout: 30000,
  });

const describeError = (error) => {
  const message = error?.response?.data?.error?.message || error?.message || 'Unknown Vercel API error';
  // Never let a token/secret leak into a message that ends up in logs or the UI.
  return message.replace(getClientSecretSafe(), '[redacted]');
};
const getClientSecretSafe = () => {
  try {
    return getClientSecret();
  } catch {
    return '\u0000never-matches\u0000';
  }
};
const wrapError = (error, context) => {
  const err = new Error(context ? `Vercel error ${context}: ${describeError(error)}` : `Vercel error: ${describeError(error)}`);
  err.provider = 'vercel';
  err.status = error?.response?.status;
  return err;
};

const getAuthenticatedUser = async (accessToken) => {
  const { data } = await vercelApi(accessToken).get('/v2/user');
  return { id: data.user?.id, username: data.user?.username, email: data.user?.email };
};

const getTeam = async (accessToken, teamId) => {
  const { data } = await vercelApi(accessToken).get(`/v2/teams/${teamId}`);
  return { id: data.id, name: data.name || data.slug };
};

/** Maps the analyzer's detected framework to Vercel's framework preset slug
 * so the dashboard shows the right build defaults. Left as `null` (Vercel
 * auto-detects) for anything we're not confident about — an unsupported
 * preset value is worse than none. */
const mapFrameworkToVercelPreset = (framework) => {
  const map = { 'Next.js': 'nextjs', React: 'vite', Vue: 'vite' };
  return map[framework] || null;
};

// --- Provider interface implementation (see provider.interface.js) ---

const validateConnection = async (credential, metadata) => {
  try {
    const user = await getAuthenticatedUser(credential);
    const accountLabel = metadata?.teamName || user.username || user.email || 'Vercel account';
    return { ok: true, accountLabel };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
};

/** Creates the Vercel project for this deployment, or adopts the existing
 * one if we already have a projectId on record (redeploy / retry path). */
const ensureProject = async (credential, metadata, config, existing) => {
  const api = vercelApi(credential, metadata?.teamId);

  if (existing?.projectId) {
    try {
      const { data } = await api.get(`/v9/projects/${existing.projectId}`);
      return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
    } catch (error) {
      if (error?.response?.status !== 404) throw wrapError(error, 'looking up existing project');
      // Project was deleted on Vercel's side since we last saw it — recreate below.
    }
  }

  try {
    const { data } = await api.post('/v9/projects', {
      name: config.projectName,
      framework: mapFrameworkToVercelPreset(config.framework),
      gitRepository: { type: 'github', repo: `${config.repoOwner}/${config.repoName}` },
      rootDirectory: config.rootDirectory || null,
      buildCommand: config.buildCommand || null,
      outputDirectory: config.outputDirectory || null,
      installCommand: config.installCommand || null,
    });
    return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
  } catch (error) {
    const alreadyExists = error?.response?.status === 409 || /already exists/i.test(error?.response?.data?.error?.message || '');
    if (alreadyExists) {
      // A project with this name is already in the account (e.g. a retried
      // request after a timed-out response) — adopt it instead of failing.
      const { data } = await api.get(`/v9/projects/${config.projectName}`);
      return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
    }
    throw wrapError(error, 'creating project');
  }
};

const configureEnvironment = async (credential, metadata, projectId, variables) => {
  const api = vercelApi(credential, metadata?.teamId);
  for (const variable of variables) {
    try {
      // upsert=true so re-running this (retry/redeploy) updates in place
      // instead of failing on a duplicate key.
      await api.post(`/v10/projects/${projectId}/env?upsert=true`, {
        key: variable.key,
        value: variable.value,
        type: 'encrypted',
        target: ['production'],
      });
    } catch (error) {
      throw wrapError(error, `setting ${variable.key}`);
    }
  }
};

const deploy = async (credential, metadata, project, { branch }) => {
  const api = vercelApi(credential, metadata?.teamId);
  try {
    const { data } = await api.post('/v13/deployments?forceNew=1', {
      name: project.projectName,
      project: project.projectId,
      target: 'production',
      gitSource: { type: 'github', ref: branch || 'main', repoId: project.repoId },
    });
    return { deployId: data.id, url: data.url ? `https://${data.url}` : null };
  } catch (error) {
    throw wrapError(error, 'triggering deployment');
  }
};

const getDeploymentStatus = async (credential, metadata, deployId) => {
  const api = vercelApi(credential, metadata?.teamId);
  const { data } = await api.get(`/v13/deployments/${deployId}`);
  const state = data.readyState; // QUEUED | INITIALIZING | BUILDING | READY | ERROR | CANCELED
  return {
    state,
    isTerminal: ['READY', 'ERROR', 'CANCELED'].includes(state),
    isSuccess: state === 'READY',
    url: data.url ? `https://${data.url}` : null,
  };
};

/** Best-effort — used when a user cancels a deployment that's still
 * building. Never throws; cancellation is a courtesy, not a guarantee. */
const cancelDeployment = async (credential, metadata, deployId) => {
  try {
    await vercelApi(credential, metadata?.teamId).patch(`/v12/deployments/${deployId}/cancel`);
  } catch {
    // Swallow — the deployment may already be terminal, which is fine.
  }
};

module.exports = {
  isConfigured,
  getInstallUrl,
  createConnectState,
  verifyConnectState,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getTeam,
  validateConnection,
  ensureProject,
  configureEnvironment,
  deploy,
  getDeploymentStatus,
  cancelDeployment,
};
