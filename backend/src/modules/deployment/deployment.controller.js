const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const GithubConnection = require('../github/githubConnection.model');
const ProjectExport = require('../github/projectExport.model');
const Deployment = require('./deployment.model');
const DeploymentProviderConnection = require('./deploymentProviderConnection.model');

const githubService = require('../../services/github.service');
const { analyzeRepository } = require('../../services/deployment/analyzer');
const { runDeployment } = require('../../services/deployment/orchestrator');
const vercelProvider = require('../../services/deployment/providers/vercel.provider');
const renderProvider = require('../../services/deployment/providers/render.provider');

const cryptoUtil = require('../../shared/utils/crypto');
const {
  PAYMENT_STATUS,
  EXPORT_STATUS,
  DEPLOYMENT_STATUS,
  DEPLOYMENT_ACTIVE_STATUSES,
  DEPLOYMENT_PROVIDERS,
} = require('../../shared/utils/constants');

const getFrontendOrigin = () => {
  try {
    return new URL(process.env.FRONTEND_URL).origin;
  } catch {
    return process.env.FRONTEND_URL || '*';
  }
};

const toScriptLiteral = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Same popup-closing pattern as github.controller.js's renderOAuthResultPage
// — kept local rather than imported since the message "type" values differ.
// Used only as a last-resort fallback (see vercelCallback) if FRONTEND_URL
// isn't configured/parseable, since the normal path now redirects to a real
// frontend page instead of relying on window.opener from this backend origin.
const renderOAuthResultPage = (payload) => `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>Vercel connection</title></head>
  <body style="font-family: sans-serif; background:#0b0b0b; color:#ece5d8; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
    <p>You can close this window now…</p>
    <script>
      (function () {
        var result = ${toScriptLiteral(payload)};
        var targetOrigin = ${toScriptLiteral(getFrontendOrigin())};
        try {
          if (window.opener) {
            window.opener.postMessage(result, targetOrigin);
          }
        } catch (e) {}
        window.close();
      })();
    </script>
  </body>
</html>`;

// Where the callback hands off to on the frontend. Returns null if
// FRONTEND_URL isn't configured/parseable so callers can fall back.
const getFrontendVercelCallbackUrl = () => {
  try {
    return new URL('/deploy/vercel-callback', process.env.FRONTEND_URL);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────

/** Re-verifies purchase ownership and finds the most recent successful
 * GitHub export for this (user, website) — the prerequisite for both
 * analyzing and deploying. Never trusts anything the client claims. */
const getVerifiedExportForDeployment = async (userId, websiteId) => {
  const purchase = await Purchase.findOne({ websiteId, buyerId: userId, paymentStatus: PAYMENT_STATUS.COMPLETED });
  if (!purchase) {
    const err = new Error('You do not own this project.');
    err.status = 403;
    throw err;
  }

  const projectExport = await ProjectExport.findOne({ websiteId, userId, status: EXPORT_STATUS.SUCCESS }).sort({ createdAt: -1 });
  if (!projectExport) {
    const err = new Error("This project needs to be published to your GitHub account before it can be deployed.");
    err.status = 400;
    err.requiresGithubPublish = true;
    throw err;
  }

  return { purchase, projectExport };
};

const getVerifiedPurchaseForDeployment = async (userId, websiteId) => {
  const purchase = await Purchase.findOne({ websiteId, buyerId: userId, paymentStatus: PAYMENT_STATUS.COMPLETED });
  if (!purchase) {
    const err = new Error('You do not own this project.');
    err.status = 403;
    throw err;
  }
  return purchase;
};

const normalizeRepositoryInput = (repository) => {
  if (!repository || typeof repository !== 'object') return null;
  const owner = String(repository.owner || '').trim();
  const name = String(repository.name || '').trim();
  const defaultBranch = String(repository.defaultBranch || 'main').trim() || 'main';
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    const err = new Error('Invalid GitHub repository selection.');
    err.status = 400;
    throw err;
  }
  return { owner, name, defaultBranch };
};

const resolveRepositoryForDeployment = async ({ userId, websiteId, repository, accessToken }) => {
  const selected = normalizeRepositoryInput(repository);
  if (selected) {
    try {
      const metadata = await githubService.getRepository(accessToken, selected.owner, selected.name);
      return {
        projectExport: null,
        repository: {
          owner: selected.owner,
          name: selected.name,
          url: metadata.htmlUrl,
          defaultBranch: metadata.defaultBranch || selected.defaultBranch,
        },
      };
    } catch (error) {
      if (error?.response?.status === 404) {
        const err = new Error('DevDrop cannot access that GitHub repository. Check your GitHub permissions.');
        err.status = 403;
        throw err;
      }
      throw error;
    }
  }

  const { projectExport } = await getVerifiedExportForDeployment(userId, websiteId);
  return {
    projectExport,
    repository: {
      owner: projectExport.repositoryOwner,
      name: projectExport.repositoryName,
      url: projectExport.repositoryUrl,
      defaultBranch: projectExport.defaultBranch,
    },
  };
};


const serializeProviders = async (userId) => {
  const [githubConnection, deployConnections] = await Promise.all([
    GithubConnection.findOne({ userId }),
    DeploymentProviderConnection.find({ userId }),
  ]);

  const byProvider = Object.fromEntries(deployConnections.map((c) => [c.provider, c]));
  const vercelConn = byProvider[DEPLOYMENT_PROVIDERS.VERCEL];
  const renderConn = byProvider[DEPLOYMENT_PROVIDERS.RENDER];

  return {
    github: githubConnection
      ? { connected: true, username: githubConnection.githubUsername, avatarUrl: githubConnection.githubAvatarUrl }
      : { connected: false },
    vercel: vercelConn
      ? { connected: true, accountLabel: vercelConn.accountLabel, teamId: vercelConn.metadata?.teamId || null }
      : { connected: false },
    render: renderConn
      ? {
          connected: true,
          accountLabel: renderConn.accountLabel,
          owners: renderConn.metadata?.owners || [],
          ownerId: renderConn.metadata?.ownerId || null,
        }
      : { connected: false },
  };
};

const serializeDeployment = (deployment) => ({
  id: deployment._id,
  websiteId: deployment.websiteId,
  repository: deployment.repository,
  architecture: deployment.architecture,
  analysis: deployment.analysis,
  envPlan: deployment.envPlan,
  frontendProvider: deployment.frontendProvider,
  backendProvider: deployment.backendProvider,
  vercel: deployment.vercel?.projectId ? { url: deployment.vercel.url, projectId: deployment.vercel.projectId } : null,
  render: deployment.render?.serviceId ? { url: deployment.render.url, serviceId: deployment.render.serviceId } : null,
  status: deployment.status,
  isActive: DEPLOYMENT_ACTIVE_STATUSES.includes(deployment.status),
  errorMessage: deployment.errorMessage || null,
  errorStep: deployment.errorStep || null,
  lastDeployedAt: deployment.lastDeployedAt || null,
  createdAt: deployment.createdAt,
  updatedAt: deployment.updatedAt,
});

// ─────────────────────────────────────────
// PROVIDER CONNECTIONS
// ─────────────────────────────────────────

/** GET /api/deployments/providers */
const getProviders = async (req, res) => {
  try {
    res.json({ success: true, data: await serializeProviders(req.userId) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking provider connections', error: error.message });
  }
};

/** POST /api/deployments/providers/vercel/connect */
const connectVercel = async (req, res) => {
  try {
    if (!vercelProvider.isConfigured()) {
      return res.status(503).json({ success: false, message: 'Vercel integration is not configured on this server yet.' });
    }

    const state = vercelProvider.createConnectState(req.userId);
    const callbackPage = new URL('/deploy/vercel-callback', process.env.FRONTEND_URL);
    const authorizeUrl = vercelProvider.getInstallUrl({
      state,
      next: callbackPage.toString(),
    });

    res.json({ success: true, data: { authorizeUrl } });
  } catch (error) {
    console.error('Vercel connect-start error:', error.message);
    res.status(500).json({ success: false, message: 'Could not start Vercel connection.' });
  }
};

/**
 * GET /api/deployments/providers/vercel/callback
 *
 * This is the actual Vercel External Integration Redirect URL. Vercel calls
 * it after the user has selected the personal account/team and project scope.
 * The callback is intentionally PUBLIC because Vercel does not send the
 * DevDrop JWT. Authentication is instead bound to the signed `state` created
 * by connectVercel().
 *
 * Vercel's documented flow expects the redirect URL to perform the code
 * exchange and finish the installation before sending the browser to `next`.
 * Do that server-side here; do not make the frontend exchange the code.
 */
const vercelCallback = async (req, res) => {
  const { code, teamId, configurationId, state, next, error: oauthError } = req.query;
  const frontendCallback = getFrontendVercelCallbackUrl();

  const finishUrl = (params = {}) => {
    const target = new URL(frontendCallback || process.env.FRONTEND_URL || 'http://localhost:5173');
    if (frontendCallback) {
      target.searchParams.set('provider', 'vercel');
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
      });
    }
    return target.toString();
  };

  if (oauthError) {
    return res.redirect(finishUrl({ error: 'Vercel authorization was cancelled or denied.' }));
  }

  if (!code || !state) {
    return res.redirect(finishUrl({ error: 'Vercel did not return the required authorization data. Please try again.' }));
  }

  let stateUser;
  try {
    stateUser = vercelProvider.verifyConnectState(state);
  } catch {
    return res.redirect(finishUrl({ error: 'Vercel connection expired or invalid. Please start the connection again.' }));
  }

  try {
    // Exchange on the backend. The browser never receives the Vercel token.
    // configurationId is stored as installation metadata, not sent to the
    // OAuth token endpoint.
    const exchanged = await vercelProvider.exchangeCodeForToken(code);
    const effectiveTeamId = teamId || exchanged.teamId || null;
    const user = await vercelProvider.getAuthenticatedUser(exchanged.accessToken);
    const team = effectiveTeamId
      ? await vercelProvider.getTeam(exchanged.accessToken, effectiveTeamId).catch(() => null)
      : null;
    const accountLabel = team?.name || user.username || user.email || 'Vercel account';

    await DeploymentProviderConnection.findOneAndUpdate(
      { userId: stateUser.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL },
      {
        userId: stateUser.userId,
        provider: DEPLOYMENT_PROVIDERS.VERCEL,
        accountLabel,
        credentialEncrypted: cryptoUtil.encrypt(exchanged.accessToken),
        metadata: {
          vercelUserId: user.id,
          teamId: effectiveTeamId,
          teamName: team?.name || null,
          configurationId: configurationId || exchanged.configurationId || null,
          installationId: exchanged.installationId || null,
        },
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Vercel's `next` is only a completion target. Never redirect to an
    // arbitrary URL supplied by a request; DevDrop owns the final target.
    return res.redirect(finishUrl({ status: 'success', accountLabel }));
  } catch (error) {
    console.error('Vercel callback error:', {
      status: error.status,
      message: error.message,
      provider: error.provider,
      teamId: teamId || null,
      configurationId: configurationId || null,
    });

    let message = 'Could not complete Vercel authorization. Please try again.';
    if (error.status === 403) {
      message = 'Vercel denied the selected account or team. Make sure you selected a team/account you can administer and that DevDrop has the required scopes.';
    } else if (error.status === 401) {
      message = 'Vercel rejected the authorization code. Start a fresh connection; authorization codes are single-use.';
    }
    return res.redirect(finishUrl({ error: message }));
  }
};

/**
 * Legacy endpoint retained for compatibility with older frontend builds.
 * New builds should never call this because the public callback now performs
 * the token exchange itself, as required by Vercel's External Integration
 * installation flow.
 */
const finishConnectVercel = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This Vercel connection flow has been upgraded. Start Connect Vercel again from DevDrop.',
  });
};

/** DELETE /api/deployments/providers/vercel/disconnect */
const disconnectVercel = async (req, res) => {
  try {
    await DeploymentProviderConnection.deleteOne({ userId: req.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL });
    res.json({ success: true, message: 'Vercel disconnected.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error disconnecting Vercel', error: error.message });
  }
};

/** POST /api/deployments/providers/render/connect  body: { apiKey } */
const connectRender = async (req, res) => {
  try {
    const apiKey = (req.body?.apiKey || '').trim();
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'Please paste your Render API key.' });
    }

    const owners = await renderProvider.listOwners(apiKey).catch((error) => {
      const err = new Error('That API key was rejected by Render. Double-check it and try again.');
      err.status = 400;
      err.cause = error;
      throw err;
    });
    if (owners.length === 0) {
      return res.status(400).json({ success: false, message: 'That key does not have access to any Render workspaces.' });
    }

    const connection = await DeploymentProviderConnection.findOneAndUpdate(
      { userId: req.userId, provider: DEPLOYMENT_PROVIDERS.RENDER },
      {
        userId: req.userId,
        provider: DEPLOYMENT_PROVIDERS.RENDER,
        accountLabel: owners[0].name,
        credentialEncrypted: cryptoUtil.encrypt(apiKey),
        metadata: { owners, ownerId: owners[0].id },
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: { connected: true, accountLabel: connection.accountLabel, owners, ownerId: connection.metadata.ownerId } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Error connecting Render' });
  }
};

/** PATCH /api/deployments/providers/render/owner  body: { ownerId } —
 * only relevant for users who belong to more than one Render workspace. */
const setRenderOwner = async (req, res) => {
  try {
    const { ownerId } = req.body;
    const connection = await DeploymentProviderConnection.findOne({ userId: req.userId, provider: DEPLOYMENT_PROVIDERS.RENDER });
    if (!connection) return res.status(400).json({ success: false, message: 'Connect Render first.' });

    const owners = connection.metadata?.owners || [];
    if (!owners.some((o) => o.id === ownerId)) {
      return res.status(400).json({ success: false, message: 'That workspace is not available on this connection.' });
    }

    connection.metadata = { ...connection.metadata, ownerId };
    connection.accountLabel = owners.find((o) => o.id === ownerId)?.name || connection.accountLabel;
    await connection.save();

    res.json({ success: true, data: { ownerId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating Render workspace', error: error.message });
  }
};

/** DELETE /api/deployments/providers/render/disconnect */
const disconnectRender = async (req, res) => {
  try {
    await DeploymentProviderConnection.deleteOne({ userId: req.userId, provider: DEPLOYMENT_PROVIDERS.RENDER });
    res.json({ success: true, message: 'Render disconnected.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error disconnecting Render', error: error.message });
  }
};

// ─────────────────────────────────────────
// ANALYSIS
// ─────────────────────────────────────────

/** POST /api/deployments/analyze/:websiteId */
const analyze = async (req, res) => {
  try {
    const { websiteId } = req.params;
    await getVerifiedPurchaseForDeployment(req.userId, websiteId);

    const connection = await GithubConnection.findOne({ userId: req.userId }).select('+accessTokenEncrypted');
    if (!connection) {
      return res.status(400).json({ success: false, message: 'Connect your GitHub account first.', requiresGithubConnection: true });
    }

    const accessToken = cryptoUtil.decrypt(connection.accessTokenEncrypted);
    const { repository } = await resolveRepositoryForDeployment({
      userId: req.userId,
      websiteId,
      repository: req.body?.repository,
      accessToken,
    });
    const analysis = await analyzeRepository({ accessToken, owner: repository.owner, repo: repository.name, branch: repository.defaultBranch });

    res.json({ success: true, data: { ...analysis, repository } });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Error analyzing repository',
      error: error.status ? undefined : error.message,
      requiresGithubPublish: error.requiresGithubPublish || undefined,
    });
  }
};

// ─────────────────────────────────────────
// DEPLOYMENTS
// ─────────────────────────────────────────

/** POST /api/deployments/:websiteId  body: { envValues?: Record<string,string> } */
const createDeployment = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.userId;
    const purchase = await getVerifiedPurchaseForDeployment(userId, websiteId);

    // Idempotency (§39): don't spin up a second deployment while one for
    // this project is still in flight — hand back the existing one instead.
    const existingActive = await Deployment.findOne({ userId, websiteId, status: { $in: DEPLOYMENT_ACTIVE_STATUSES } });
    if (existingActive) {
      return res.status(200).json({ success: true, data: { deploymentId: existingActive._id, status: existingActive.status, resumed: true } });
    }

    const githubConnection = await GithubConnection.findOne({ userId }).select('+accessTokenEncrypted');
    if (!githubConnection) {
      return res.status(400).json({ success: false, message: 'Connect your GitHub account first.', requiresGithubConnection: true });
    }

    const accessToken = cryptoUtil.decrypt(githubConnection.accessTokenEncrypted);
    const { projectExport, repository } = await resolveRepositoryForDeployment({
      userId,
      websiteId,
      repository: req.body?.repository,
      accessToken,
    });
    const analysis = await analyzeRepository({
      accessToken,
      owner: repository.owner,
      repo: repository.name,
      branch: repository.defaultBranch,
    });

    if (analysis.architecture === 'UNKNOWN') {
      return res.status(422).json({
        success: false,
        message: "We couldn't automatically determine how to deploy this project. Please review the detected configuration manually.",
        data: analysis,
      });
    }

    const neededProviders = [analysis.frontend?.provider, analysis.backend?.provider].filter(Boolean);
    const connections = await DeploymentProviderConnection.find({ userId, provider: { $in: neededProviders } });
    const connectedProviders = new Set(connections.map((c) => c.provider));
    const missingProviders = neededProviders.filter((p) => !connectedProviders.has(p));
    if (missingProviders.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Connect ${missingProviders.map((p) => (p === 'vercel' ? 'Vercel' : 'Render')).join(' and ')} under Connected Accounts before deploying.`,
        missingProviders,
      });
    }
    const renderConnection = connections.find((c) => c.provider === DEPLOYMENT_PROVIDERS.RENDER);
    if (analysis.backend && !renderConnection?.metadata?.ownerId) {
      return res.status(400).json({ success: false, message: 'Select a Render workspace under Connected Accounts before deploying.' });
    }

    // Only accept values for keys the analyzer itself found and marked as
    // buyer-supplied — never let arbitrary client-supplied keys through to
    // a provider's environment configuration.
    const requestedValues = req.body?.envValues && typeof req.body.envValues === 'object' ? req.body.envValues : {};
    const userVarEntries = analysis.envPlan.filter((e) => e.source === 'user');
    const missingRequired = userVarEntries.filter((e) => e.required && !String(requestedValues[e.key] || '').trim());
    if (missingRequired.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in the required environment variables before deploying.',
        missingVariables: missingRequired.map((e) => e.key),
      });
    }

    const secretsToStore = {};
    userVarEntries.forEach((e) => {
      const value = requestedValues[e.key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        secretsToStore[e.key] = String(value);
      }
    });

    const deployment = await Deployment.create({
      userId,
      websiteId,
      purchaseId: purchase._id,
      projectExportId: projectExport?._id || null,
      repository,
      architecture: analysis.architecture,
      analysis: { frontend: analysis.frontend, backend: analysis.backend },
      envPlan: analysis.envPlan,
      frontendProvider: analysis.frontend?.provider || null,
      backendProvider: analysis.backend?.provider || null,
      status: DEPLOYMENT_STATUS.QUEUED,
      pendingSecretsEncrypted: Object.keys(secretsToStore).length > 0 ? cryptoUtil.encrypt(JSON.stringify(secretsToStore)) : null,
    });

    setImmediate(() => {
      runDeployment(deployment._id).catch((err) => {
        console.error(`Unhandled error running deployment ${deployment._id}:`, err);
      });
    });

    res.status(202).json({ success: true, data: { deploymentId: deployment._id, status: deployment.status } });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Error starting deployment',
      error: error.status ? undefined : error.message,
      requiresGithubPublish: error.requiresGithubPublish || undefined,
    });
  }
};

/** GET /api/deployments  query: page, limit, status=all|successful|failed|deploying */
const listDeployments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { userId: req.userId };
    if (status === 'successful') filter.status = DEPLOYMENT_STATUS.SUCCESS;
    else if (status === 'failed') filter.status = DEPLOYMENT_STATUS.FAILED;
    else if (status === 'deploying') filter.status = { $in: DEPLOYMENT_ACTIVE_STATUSES };

    const deployments = await Deployment.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));
    const total = await Deployment.countDocuments(filter);

    res.json({
      success: true,
      data: deployments.map(serializeDeployment),
      pagination: { currentPage: parseInt(page, 10), totalPages: Math.ceil(total / limit), totalItems: total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deployments', error: error.message });
  }
};

/** GET /api/deployments/website/:websiteId — most recent deployment, if any. */
const getDeploymentForWebsite = async (req, res) => {
  try {
    const deployment = await Deployment.findOne({ websiteId: req.params.websiteId, userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: deployment ? serializeDeployment(deployment) : null });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deployment', error: error.message });
  }
};

/** GET /api/deployments/:deploymentId */
const getDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findOne({ _id: req.params.deploymentId, userId: req.userId });
    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });
    res.json({ success: true, data: serializeDeployment(deployment) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching deployment', error: error.message });
  }
};

/** POST /api/deployments/:deploymentId/redeploy — reuses existing Vercel
 * project / Render service; only the analyzer's env auto-values (URLs,
 * NODE_ENV) get refreshed. Buyer-supplied secrets from the original
 * deployment are NOT re-collected here (they were cleared after first use);
 * a redeploy re-pushes whatever's already configured on the provider side. */
const redeploy = async (req, res) => {
  try {
    const deployment = await Deployment.findOne({ _id: req.params.deploymentId, userId: req.userId });
    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });
    if (DEPLOYMENT_ACTIVE_STATUSES.includes(deployment.status)) {
      return res.status(409).json({ success: false, message: 'This deployment is already in progress.' });
    }

    deployment.status = DEPLOYMENT_STATUS.QUEUED;
    deployment.errorMessage = undefined;
    deployment.errorStep = undefined;
    await deployment.save();

    setImmediate(() => {
      runDeployment(deployment._id).catch((err) => {
        console.error(`Unhandled error redeploying ${deployment._id}:`, err);
      });
    });

    res.status(202).json({ success: true, data: { deploymentId: deployment._id, status: deployment.status } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error starting redeploy', error: error.message });
  }
};

/** POST /api/deployments/:deploymentId/cancel */
const cancelDeployment = async (req, res) => {
  try {
    const deployment = await Deployment.findOne({ _id: req.params.deploymentId, userId: req.userId });
    if (!deployment) return res.status(404).json({ success: false, message: 'Deployment not found' });
    if (!DEPLOYMENT_ACTIVE_STATUSES.includes(deployment.status)) {
      return res.status(409).json({ success: false, message: 'This deployment is not currently running.' });
    }

    // Best-effort: Vercel supports cancelling an in-progress build; Render's
    // current API doesn't expose an equivalent, so a Render build already
    // running may keep running on their side even after we mark this
    // cancelled — the orchestrator checks CANCELLED before each phase and
    // will stop advancing regardless.
    if (deployment.status === DEPLOYMENT_STATUS.DEPLOYING_FRONTEND && deployment.vercel?.deploymentId) {
      const connection = await DeploymentProviderConnection.findOne({ userId: req.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL }).select('+credentialEncrypted');
      if (connection) {
        await vercelProvider.cancelDeployment(cryptoUtil.decrypt(connection.credentialEncrypted), connection.metadata, deployment.vercel.deploymentId);
      }
    }

    deployment.status = DEPLOYMENT_STATUS.CANCELLED;
    await deployment.save();
    res.json({ success: true, message: 'Deployment cancelled.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error cancelling deployment', error: error.message });
  }
};

module.exports = {
  getProviders,
  connectVercel,
  vercelCallback,
  finishConnectVercel,
  disconnectVercel,
  connectRender,
  setRenderOwner,
  disconnectRender,
  analyze,
  createDeployment,
  listDeployments,
  getDeploymentForWebsite,
  getDeployment,
  redeploy,
  cancelDeployment,
};
