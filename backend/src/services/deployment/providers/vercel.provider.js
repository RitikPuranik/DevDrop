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

  // Vercel returns configurationId for integration installations. Sending
  // it during the exchange binds the resulting credential to the selected
  // installation and avoids the invalid/Access Denied behavior seen when a
  // configuration is already installed. Older Vercel responses may omit it,
  // so only include it when supplied.
  if (configurationId) body.set('configurationId', configurationId);

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
const mapFrameworkToVercelPreset = (framework, buildTool) => {
  const rawFramework = String(framework || '').trim().toLowerCase();
  const rawBuildTool = String(buildTool || '').trim().toLowerCase();

  if (rawFramework === 'vite' || rawBuildTool === 'vite') return 'vite';
  if (rawFramework === 'next.js' || rawFramework === 'nextjs' || rawFramework.includes('next')) return 'nextjs';
  if (rawFramework === 'react' || rawFramework.includes('react')) return 'vite';
  if (rawFramework === 'vue' || rawFramework.includes('vue')) return 'vue';
  if (rawFramework === 'svelte') return 'svelte';
  if (rawFramework === 'sveltekit') return 'sveltekit';
  if (rawFramework === 'astro') return 'astro';
  if (rawFramework === 'angular') return 'angular';
  if (rawFramework === 'preact') return 'preact';
  return null;
};

const buildProjectSettings = (config = {}) => {
  const buildTool = String(config.buildTool || '').trim().toLowerCase();
  const framework = String(config.framework || '').trim().toLowerCase();
  const buildCommand = String(config.buildCommand || '').trim();
  const outputDirectory = String(config.outputDirectory || '').trim();

  // The analyzer may persist older deployment records that contain buildTool
  // and outputDirectory but have a missing/legacy framework value. Recover the
  // Vercel preset from the strongest available signals instead of sending
  // framework=null and letting the project fall back to "Other".
  const looksViteLike =
    buildTool === 'vite' ||
    framework === 'vite' ||
    framework === 'react' ||
    framework === 'vue' ||
    /\bvite\b/i.test(buildCommand) ||
    outputDirectory === 'dist';

  const inferredFramework = config.framework || (looksViteLike ? 'Vite' : null);
  const normalizedBuildCommand = config.buildCommand || (looksViteLike ? 'npm run build' : null);
  const normalizedOutputDirectory = config.outputDirectory || (looksViteLike ? 'dist' : null);
  const normalizedInstallCommand = config.installCommand || (inferredFramework || buildTool ? 'npm install' : null);
  const frameworkPreset = mapFrameworkToVercelPreset(inferredFramework, buildTool);

  return {
    framework: frameworkPreset,
    rootDirectory: config.rootDirectory || null,
    buildCommand: normalizedBuildCommand,
    outputDirectory: normalizedOutputDirectory,
    installCommand: normalizedInstallCommand,
  };
};

const assertCompleteFrontendSettings = (settings) => {
  const isStaticSite =
    !settings.framework &&
    !settings.buildCommand &&
    !settings.installCommand &&
    (!settings.outputDirectory || settings.outputDirectory === '.');
  if (isStaticSite) return;

  const missing = [];
  if (!settings.framework) missing.push('framework');

  const isViteFamily = settings.framework === 'vite' || settings.framework === 'vue';
  const isNextJs = settings.framework === 'nextjs';

  if (isViteFamily && !settings.buildCommand) missing.push('buildCommand');
  if (isViteFamily && (!settings.outputDirectory || settings.outputDirectory === '.')) missing.push('outputDirectory');
  if (!settings.installCommand) missing.push('installCommand');

  // Next.js and several other Vercel-native frameworks may intentionally leave
  // outputDirectory unset so Vercel uses the framework's native output.
  // Likewise, a framework can rely on Vercel's default build command when the
  // analyzer explicitly identified the framework. Only Vite-family projects
  // require the explicit dist/build pair that prevents raw source serving.
  if (isNextJs) {
    const nextOnlyMissing = missing.filter((field) => !['buildCommand', 'outputDirectory'].includes(field));
    if (nextOnlyMissing.length === 0) return;
  }

  if (missing.length) {
    const err = new Error(`Vercel deployment configuration is incomplete: ${missing.join(', ')} could not be resolved from the repository analysis.`);
    err.status = 409;
    err.provider = 'vercel';
    err.missingSettings = missing;
    throw err;
  }
};

/**
 * Re-applies the deployment plan to an existing Vercel project. This is
 * intentionally done even when a project already exists: Vercel persists old
 * framework/root/build overrides, and those stale settings can make an
 * otherwise-correct repository serve raw source files (for example .tsx as
 * application/octet-stream) instead of the production dist output.
 */
const synchronizeProjectSettings = async (api, projectId, config) => {
  const settings = buildProjectSettings(config);
  assertCompleteFrontendSettings(settings);

  await api.patch(`/v9/projects/${projectId}`, settings);

  // Verify with a fresh GET rather than trusting the PATCH response. This is
  // important for integration credentials because the returned project object
  // can be stale/partial even though the dashboard settings are persisted.
  const { data: verified } = await api.get(`/v9/projects/${projectId}`);
  const fields = ['framework', 'rootDirectory', 'buildCommand', 'outputDirectory', 'installCommand'];
  const mismatches = fields.filter((field) => {
    const expected = settings[field] ?? null;
    const actual = verified?.[field] ?? null;
    return expected !== actual;
  });

  if (mismatches.length) {
    const err = new Error(`Vercel project settings were not persisted: ${mismatches.join(', ')}`);
    err.status = 502;
    err.provider = 'vercel';
    err.expectedSettings = settings;
    err.actualSettings = mismatches.reduce((acc, field) => {
      acc[field] = verified?.[field] ?? null;
      return acc;
    }, {});
    throw err;
  }

  console.log(`[vercel] verified project settings for ${projectId}`, settings);
  return settings;
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
      try {
        const settings = await synchronizeProjectSettings(api, data.id, config);
        console.log(`[vercel] synchronized project ${data.name} (${data.id})`, settings);
      } catch (error) {
        throw wrapError(error, 'synchronizing existing project settings');
      }
      return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
    } catch (error) {
      if (error?.response?.status !== 404) throw error?.provider === 'vercel' ? error : wrapError(error, 'looking up existing project');
      // Project was deleted on Vercel's side since we last saw it — recreate below.
    }
  }

  try {
    const { data } = await api.post('/v9/projects', {
      name: config.projectName,
      ...buildProjectSettings(config),
      gitRepository: { type: 'github', repo: `${config.repoOwner}/${config.repoName}` },
    });
    return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
  } catch (error) {
    const alreadyExists = error?.response?.status === 409 || /already exists/i.test(error?.response?.data?.error?.message || '');
    if (alreadyExists) {
      // A project with this name is already in the account (e.g. a retried
      // request after a timed-out response) — adopt it and force the new plan.
      try {
        const { data } = await api.get(`/v9/projects/${config.projectName}`);
        const settings = await synchronizeProjectSettings(api, data.id, config);
        console.log(`[vercel] synchronized adopted project ${data.name} (${data.id})`, settings);
        return { projectId: data.id, projectName: data.name, repoId: data.link?.repoId || null };
      } catch (adoptError) {
        throw wrapError(adoptError, 'adopting existing project');
      }
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
    // Production aliases (e.g. my-site.vercel.app) are public even when the unique deployment URL sits behind Deployment Protection.
    aliases: Array.isArray(data.alias) ? data.alias : [],
  };
};

/** Vercel's own summary of why a deployment errored (fallback when no build log is available). */
const getDeploymentError = async (credential, metadata, deployId) => {
  const { data } = await vercelApi(credential, metadata?.teamId).get(`/v13/deployments/${deployId}`);
  return { errorCode: data.errorCode || null, errorMessage: data.errorMessage || null };
};

/** The GitHub repo id Vercel linked to a project (needed to trigger a git deployment). */
const getProjectRepoId = async (credential, metadata, projectId) => {
  const { data } = await vercelApi(credential, metadata?.teamId).get(`/v9/projects/${projectId}`);
  return { repoId: data.link?.repoId || null, projectName: data.name };
};

/** Plain-text build log of a deployment (stdout/stderr/command lines, in order). */
const getBuildLogs = async (credential, metadata, deployId) => {
  const { data } = await vercelApi(credential, metadata?.teamId).get(`/v3/deployments/${deployId}/events`, {
    params: { builds: 1, direction: 'forward', limit: -1 },
  });
  const events = Array.isArray(data) ? data : data?.events || [];
  return events
    .map((e) => e?.text ?? e?.payload?.text ?? '')
    .filter((line) => typeof line === 'string' && line.length)
    .join('\n');
};

/** Most recent deployments of a project (newest first). */
const listProjectDeployments = async (credential, metadata, projectId, limit = 10) => {
  const { data } = await vercelApi(credential, metadata?.teamId).get('/v6/deployments', { params: { projectId, limit } });
  return (data?.deployments || []).map((d) => ({
    id: d.uid || d.id,
    state: d.readyState || d.state,
    url: d.url ? `https://${d.url}` : null,
    createdAt: d.created || d.createdAt || 0,
    target: d.target || null,
    commitSha: d.meta?.githubCommitSha || null,
  }));
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


// ─────────────────────────────────────────────────────────────────────────
// Deployment history, production state, rollback and logs
// (Deployment management). Every endpoint below is a documented Vercel REST
// API endpoint:
//   GET  /v6/deployments                                   list deployments
//   GET  /v13/deployments/{id}                             deployment detail
//   GET  /v9/projects/{id}                                 project (targets.production, autoAssignCustomDomains, lastAliasRequest)
//   POST /v1/projects/{projectId}/rollback/{deploymentId}  instant rollback (no rebuild)
//   POST /v10/projects/{projectId}/promote/{deploymentId}  promote a staged production deployment (no rebuild)
//   GET  /v1/projects/{projectId}/promote/aliases          alias mapping status of the last promote/rollback
//   GET  /v3/deployments/{id}/events                       build logs
//   GET  /v1/projects/{projectId}/deployments/{id}/runtime-logs   runtime logs (stream+json, no paging params)
// ─────────────────────────────────────────────────────────────────────────

const { classifyVercelError, VercelRequestError } = require('../vercelErrors');

const toMs = (value) => {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) ? n : null;
};

const VERSION_STATES = new Set(['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED']);

/** Normalizes a Vercel deployment object (v6 list item or v13 detail) into DevDrop's shape. */
const normalizeDeployment = (d = {}) => {
  const rawState = String(d.readyState || d.state || '').toUpperCase();
  const buildingAt = toMs(d.buildingAt);
  const readyAt = toMs(d.ready ?? d.readyAt);
  const target = d.target || null;
  const meta = d.meta || {};
  return {
    id: d.uid || d.id,
    projectId: d.projectId || null,
    url: d.url ? `https://${String(d.url).replace(/^https?:\/\//, '')}` : null,
    state: VERSION_STATES.has(rawState) ? rawState : 'UNKNOWN',
    readySubstate: d.readySubstate ? String(d.readySubstate).toUpperCase() : null,
    target,
    environment: target === 'production' ? 'production' : 'preview',
    createdAt: toMs(d.createdAt ?? d.created),
    buildingAt,
    readyAt,
    durationMs: buildingAt && readyAt && readyAt >= buildingAt ? readyAt - buildingAt : null,
    commitSha: meta.githubCommitSha || meta.gitlabCommitSha || meta.bitbucketCommitSha || null,
    commitMessage: meta.githubCommitMessage || meta.gitlabCommitMessage || meta.bitbucketCommitMessage || null,
    commitRef: meta.githubCommitRef || meta.gitlabCommitRef || meta.bitbucketCommitRef || null,
    inspectorUrl: d.inspectorUrl || null,
    errorCode: d.errorCode || null,
    errorMessage: d.errorMessage || null,
    aliases: Array.isArray(d.alias) ? d.alias : [],
    creatorId: d.creator?.uid || null,
  };
};

const wrapRead = (error) => new VercelRequestError(classifyVercelError(error, 'read'), error);

/** One bounded page of a project's deployments (newest first). `next` is the `until` cursor for the following page. */
const listDeploymentsPage = async (credential, metadata, projectId, { limit = 100, until, since } = {}) => {
  try {
    const params = { projectId, limit: Math.min(Math.max(limit, 1), 100) };
    if (until) params.until = until;
    if (since) params.since = since;
    const { data } = await vercelApi(credential, metadata?.teamId).get('/v6/deployments', { params });
    const deployments = (data?.deployments || []).map((d) => normalizeDeployment({ ...d, projectId: d.projectId || projectId }));
    return { deployments, next: data?.pagination?.next ?? null };
  } catch (error) {
    throw wrapRead(error);
  }
};

/** Fresh deployment detail (includes readySubstate, errorMessage, aliases). */
const getDeployment = async (credential, metadata, deploymentId) => {
  try {
    const { data } = await vercelApi(credential, metadata?.teamId).get(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
    return normalizeDeployment(data);
  } catch (error) {
    throw wrapRead(error);
  }
};

/** Project fields relevant to "what is serving production right now". */
const extractProductionState = (project = {}) => {
  const lar = project.lastAliasRequest || null;
  return {
    projectId: project.id || null,
    projectName: project.name || null,
    // targets.production is the deployment currently aliased to production domains.
    currentDeploymentId: project.targets?.production?.id || null,
    autoAssignCustomDomains: typeof project.autoAssignCustomDomains === 'boolean' ? project.autoAssignCustomDomains : null,
    lastAliasRequest: lar
      ? {
          type: lar.type || null,
          fromDeploymentId: lar.fromDeploymentId || null,
          toDeploymentId: lar.toDeploymentId || null,
          jobStatus: lar.jobStatus || null,
          requestedAt: toMs(lar.requestedAt),
        }
      : null,
  };
};

const getProductionState = async (credential, metadata, projectId) => {
  try {
    const { data } = await vercelApi(credential, metadata?.teamId).get(`/v9/projects/${encodeURIComponent(projectId)}`);
    return extractProductionState(data);
  } catch (error) {
    throw wrapRead(error);
  }
};

/** Instant rollback: re-points production domains at an existing deployment. No rebuild. Not idempotent-safe to blind-retry. */
const requestRollback = async (credential, metadata, projectId, deploymentId, { description } = {}) => {
  try {
    const params = {};
    if (description) params.description = String(description).slice(0, 200);
    await vercelApi(credential, metadata?.teamId).post(
      `/v1/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(deploymentId)}`,
      null,
      { params }
    );
    return { accepted: true };
  } catch (error) {
    throw new VercelRequestError(classifyVercelError(error, 'rollback'), error);
  }
};

/** Promotes a staged production deployment (never served traffic) without rebuilding it. */
const requestPromote = async (credential, metadata, projectId, deploymentId) => {
  try {
    await vercelApi(credential, metadata?.teamId).post(
      `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`
    );
    return { accepted: true };
  } catch (error) {
    throw new VercelRequestError(classifyVercelError(error, 'promote'), error);
  }
};

/** Alias-mapping status of the project's most recent promote/rollback request (bounded to failures by default). */
const getPromoteAliases = async (credential, metadata, projectId, { failedOnly = false, limit = 20 } = {}) => {
  try {
    const { data } = await vercelApi(credential, metadata?.teamId).get(`/v1/projects/${encodeURIComponent(projectId)}/promote/aliases`, {
      params: { limit: Math.min(limit, 100), ...(failedOnly ? { failedOnly: true } : {}) },
    });
    return Array.isArray(data?.aliases) ? data.aliases.map((a) => ({ alias: a.alias, status: a.status, id: a.id })) : [];
  } catch (error) {
    throw wrapRead(error);
  }
};

/** Bounded build-log read: at most `limit` events, oldest first. */
const getBuildEvents = async (credential, metadata, deploymentId, { limit = 1000 } = {}) => {
  try {
    const { data } = await vercelApi(credential, metadata?.teamId).get(`/v3/deployments/${encodeURIComponent(deploymentId)}/events`, {
      params: { builds: 1, direction: 'forward', limit: Math.min(Math.max(limit, 1), 5000) },
    });
    return Array.isArray(data) ? data : data?.events || [];
  } catch (error) {
    throw wrapRead(error);
  }
};

/**
 * Runtime logs are a `application/stream+json` response with no documented
 * paging/filter parameters, so the only safe way to read them is to consume
 * the stream until a line/byte/time budget is spent and then abort it.
 */
const readRuntimeLogs = async (credential, metadata, projectId, deploymentId, { maxLines = 1000, maxBytes = 1024 * 1024, timeoutMs = 6000 } = {}) => {
  let response;
  try {
    response = await vercelApi(credential, metadata?.teamId).get(
      `/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`,
      { responseType: 'stream', timeout: Math.min(timeoutMs, 15000), headers: { Accept: 'application/stream+json' } }
    );
  } catch (error) {
    throw wrapRead(error);
  }

  const stream = response.data;
  return new Promise((resolve, reject) => {
    const entries = [];
    let buffered = '';
    let bytes = 0;
    let truncated = false;
    let finished = false;

    const finish = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { stream.destroy(); } catch { /* already closed */ }
      if (err && entries.length === 0) reject(wrapRead(err));
      else resolve({ entries, truncated });
    };

    const pushLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // Ignore non-JSON keep-alive/garbage lines.
      }
      if (entries.length >= maxLines) {
        truncated = true;
        finish();
      }
    };

    const timer = setTimeout(() => {
      truncated = true;
      finish();
    }, timeoutMs);
    timer.unref?.();

    stream.on('data', (chunk) => {
      if (finished) return;
      bytes += chunk.length;
      buffered += chunk.toString('utf8');
      const lines = buffered.split('\n');
      buffered = lines.pop();
      for (const line of lines) {
        if (finished) return;
        pushLine(line);
      }
      if (bytes >= maxBytes) {
        truncated = true;
        finish();
      }
    });
    stream.on('end', () => {
      if (!finished && buffered) pushLine(buffered);
      finish();
    });
    stream.on('error', (err) => finish(err));
  });
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
  synchronizeProjectSettings,
  buildProjectSettings,
  assertCompleteFrontendSettings,
  configureEnvironment,
  deploy,
  getDeploymentStatus,
  getDeploymentError,
  getProjectRepoId,
  getBuildLogs,
  listProjectDeployments,
  cancelDeployment,
  normalizeDeployment,
  extractProductionState,
  listDeploymentsPage,
  getDeployment,
  getProductionState,
  requestRollback,
  requestPromote,
  getPromoteAliases,
  getBuildEvents,
  readRuntimeLogs,
};
