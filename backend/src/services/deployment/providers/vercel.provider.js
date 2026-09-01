const axios = require('axios');

/**
 * Vercel deployment provider.
 *
 * IMPORTANT — how Vercel's OAuth differs from GitHub's (confirmed against
 * a live Integration Console app + Vercel's own example-integration repo
 * after the `next`-as-state approach below turned out not to work):
 *
 * Vercel's third-party API access isn't a generic "build an /authorize URL
 * with client_id+redirect_uri" flow like GitHub's. It's granted through an
 * "Integration" registered in Vercel's Integration Console, which issues a
 * client_id/client_secret and a FIXED redirect URL (configured in the
 * console itself, not passed per-request). Users start the connection from
 * Vercel's own install page for that integration
 * (https://vercel.com/integrations/<slug>/new), pick an account/team scope
 * there, and Vercel redirects back to the pre-registered redirect URL with
 * a `code` (plus `teamId`/`configurationId`). We exchange that code for an
 * access token server-side.
 *
 * There is NO `state` passthrough on this flow — `next` is NOT an echo of
 * whatever we put on the install link. Per Vercel's own example-integration
 * docs, `next` is "the URL we're redirecting [the user] to once setup is
 * done" — i.e. it's Vercel telling *us* where to send the browser when
 * we're finished, not a value we control that comes back untouched. A
 * previous version of this code tried to smuggle a signed JWT through it
 * expecting an echo-back; in production `next` came back as a Vercel
 * dashboard URL instead (with `source=external`), so `jwt.verify` on it
 * always failed and the connection was never saved even though the Vercel
 * install itself succeeded.
 *
 * Because there's no reliable way to identify "which of our users is this"
 * from the callback request alone (no state param, and auth here is
 * Bearer-token-in-header, so no session cookie rides along on Vercel's
 * redirect either), identity verification happens on the FRONTEND side
 * instead: the public callback route just relays `code`/`teamId` back to
 * the opener tab via postMessage (see deployment.controller.js's
 * vercelCallback), and the already-authenticated SPA calls
 * POST /providers/vercel/finish-connect (protected by the normal `auth`
 * middleware, so `req.userId` is known) to do the actual token exchange
 * and save the connection.
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

/** Where the "Connect Vercel" button sends the user's browser (popup). No
 * state param here — see the header comment above for why. */
const getInstallUrl = () => `https://vercel.com/integrations/${getIntegrationSlug()}/new`;

const exchangeCodeForToken = async (code) => {
  const { data } = await axios.post(
    'https://api.vercel.com/v2/oauth/access_token',
    new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUri(),
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!data.access_token) throw new Error('Vercel did not return an access token.');
  return {
    accessToken: data.access_token,
    teamId: data.team_id || null,
    vercelUserId: data.user_id || null,
    installationId: data.installation_id || null,
  };
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
