const axios = require('axios');

/**
 * Vercel grants third-party access through an Integration installation. For
 * external installations Vercel supports `next` and `state` query parameters
 * on /integrations/:slug/new. DevDrop uses `next` to make the post-install
 * handoff explicit and reserves `state` for the authenticated CSRF binding.
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

const isConfigured = () => Boolean(
  process.env.VERCEL_CLIENT_ID &&
  process.env.VERCEL_CLIENT_SECRET &&
  process.env.VERCEL_OAUTH_REDIRECT_URI &&
  process.env.VERCEL_INTEGRATION_SLUG
);

const getFrontendCallbackUrl = () => {
  try {
    return new URL('/deploy/vercel-callback', process.env.FRONTEND_URL).toString();
  } catch {
    return null;
  }
};

const getInstallUrl = ({ next, state } = {}) => {
  const url = new URL(`https://vercel.com/integrations/${getIntegrationSlug()}/new`);
  const completionUrl = next || getFrontendCallbackUrl();
  if (completionUrl) url.searchParams.set('next', completionUrl);
  if (state) url.searchParams.set('state', state);
  return url.toString();
};

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

const vercelApi = (accessToken, teamId) => axios.create({
  baseURL: 'https://api.vercel.com',
  headers: { Authorization: `Bearer ${accessToken}` },
  params: teamId ? { teamId } : undefined,
  timeout: 30000,
});

const getClientSecretSafe = () => {
  try {
    return getClientSecret();
  } catch {
    return '\u0000never-matches\u0000';
  }
};

const describeError = (error) => {
  const message = error?.response?.data?.error?.message || error?.message || 'Unknown Vercel API error';
  return message.replace(getClientSecretSafe(), '[redacted]');
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

const getTeams = async (accessToken) => {
  try {
    const { data } = await axios.get('https://api.vercel.com/v2/teams', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 100 },
      timeout: 30000,
    });
    return (data.teams || []).map((team) => ({ id: team.id, name: team.name || team.slug, slug: team.slug }));
  } catch (error) {
    throw wrapError(error, 'listing teams');
  }
};

const getTeam = async (accessToken, teamId) => {
  try {
    const { data } = await axios.get(`https://api.vercel.com/v2/teams/${teamId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 30000,
    });
    return { id: data.id, name: data.name || data.slug };
  } catch (error) {
    throw wrapError(error, 'loading team');
  }
};

const listProjects = async (accessToken, teamId) => {
  try {
    const { data } = await axios.get('https://api.vercel.com/v9/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 100, ...(teamId ? { teamId } : {}) },
      timeout: 30000,
    });
    return (data.projects || []).map((project) => ({
      id: project.id,
      name: project.name,
      framework: project.framework || null,
      link: project.link
        ? { type: project.link.type, repo: project.link.repo, org: project.link.org, repoId: project.link.repoId }
        : null,
    }));
  } catch (error) {
    throw wrapError(error, 'listing projects');
  }
};

const mapFrameworkToVercelPreset = (framework) => {
  const map = { 'Next.js': 'nextjs', React: 'vite', Vue: 'vite' };
  return map[framework] || null;
};

const validateConnection = async (credential, metadata) => {
  try {
    const user = await getAuthenticatedUser(credential);
    const accountLabel = metadata?.teamName || user.username || user.email || 'Vercel account';
    return { ok: true, accountLabel };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
};

const ensureProject = async (credential, metadata, config, existing) => {
  const api = vercelApi(credential, metadata?.teamId);

  if (existing?.projectId) {
    try {
      const { data } = await api.get(`/v9/projects/${existing.projectId}`);
      return {
        projectId: data.id,
        projectName: data.name,
        repoId: data.link?.repoId || null,
      };
    } catch (error) {
      if (error?.response?.status !== 404) throw wrapError(error, 'looking up existing project');
    }
  }

  const payload = {
    name: config.projectName,
    gitRepository: { type: 'github', repo: `${config.repoOwner}/${config.repoName}` },
  };
  const framework = mapFrameworkToVercelPreset(config.framework);
  if (framework) payload.framework = framework;
  if (config.rootDirectory) payload.rootDirectory = config.rootDirectory;
  if (config.buildCommand) payload.buildCommand = config.buildCommand;
  if (config.outputDirectory) payload.outputDirectory = config.outputDirectory;
  if (config.installCommand) payload.installCommand = config.installCommand;

  try {
    const { data } = await api.post('/v9/projects', payload);
    return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
  } catch (error) {
    const message = error?.response?.data?.error?.message || '';
    const alreadyExists = error?.response?.status === 409 || /already exists/i.test(message);
    if (alreadyExists) {
      const { data } = await api.get(`/v9/projects/${encodeURIComponent(config.projectName)}`);
      const linkedRepo = data.link?.repo;
      if (linkedRepo && linkedRepo !== `${config.repoOwner}/${config.repoName}`) {
        throw Object.assign(new Error('A Vercel project with that name belongs to a different GitHub repository.'), {
          provider: 'vercel',
          status: 409,
        });
      }
      return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
    }
    throw wrapError(error, 'creating project');
  }
};

const configureEnvironment = async (credential, metadata, projectId, variables) => {
  const api = vercelApi(credential, metadata?.teamId);
  for (const variable of variables) {
    try {
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
    if (!project.repoId) {
      throw Object.assign(new Error('Vercel did not return the linked GitHub repository ID for this project.'), { provider: 'vercel' });
    }
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
  try {
    const { data } = await api.get(`/v13/deployments/${deployId}`);
    const state = data.readyState;
    return {
      state,
      isTerminal: ['READY', 'ERROR', 'CANCELED'].includes(state),
      isSuccess: state === 'READY',
      url: data.url ? `https://${data.url}` : null,
    };
  } catch (error) {
    throw wrapError(error, 'checking deployment status');
  }
};

const cancelDeployment = async (credential, metadata, deployId) => {
  try {
    await vercelApi(credential, metadata?.teamId).patch(`/v12/deployments/${deployId}/cancel`);
  } catch {
    // The deployment may already be terminal. Cancellation is best-effort.
  }
};

module.exports = {
  isConfigured,
  getInstallUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
  getTeams,
  getTeam,
  listProjects,
  validateConnection,
  ensureProject,
  configureEnvironment,
  deploy,
  getDeploymentStatus,
  cancelDeployment,
};
