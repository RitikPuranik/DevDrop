const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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

const OAUTH_STATE_EXPIRY = '10m';

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
    const state = jwt.sign(
      { userId: req.userId.toString(), purpose: 'vercel_oauth', nonce: crypto.randomBytes(8).toString('hex') },
      process.env.JWT_SECRET,
      { expiresIn: OAUTH_STATE_EXPIRY }
    );
    res.json({ success: true, data: { authorizeUrl: vercelProvider.getInstallUrl(state) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not start Vercel connection.', error: error.message });
  }
};

/** GET /api/deployments/providers/vercel/callback — public; Vercel echoes
 * our signed state token back on the `next` param (see vercel.provider.js). */
const vercelCallback = async (req, res) => {
  const { code, next: state, error: oauthError } = req.query;
  try {
    if (oauthError) {
      return res.send(renderOAuthResultPage({ type: 'vercel-oauth-error', message: 'Vercel authorization was cancelled or denied.' }));
    }
    if (!code || !state) {
      return res.send(renderOAuthResultPage({ type: 'vercel-oauth-error', message: 'Missing authorization code.' }));
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.send(renderOAuthResultPage({ type: 'vercel-oauth-error', message: 'This connection request expired. Please try again.' }));
    }
    if (decoded.purpose !== 'vercel_oauth' || !decoded.userId) {
      return res.send(renderOAuthResultPage({ type: 'vercel-oauth-error', message: 'Invalid connection request.' }));
    }

    const { accessToken, teamId } = await vercelProvider.exchangeCodeForToken(code);
    const user = await vercelProvider.getAuthenticatedUser(accessToken);
    const team = teamId ? await vercelProvider.getTeam(accessToken, teamId).catch(() => null) : null;

    await DeploymentProviderConnection.findOneAndUpdate(
      { userId: decoded.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL },
      {
        userId: decoded.userId,
        provider: DEPLOYMENT_PROVIDERS.VERCEL,
        accountLabel: team?.name || user.username || user.email || 'Vercel account',
        credentialEncrypted: cryptoUtil.encrypt(accessToken),
        metadata: { vercelUserId: user.id, teamId: teamId || null, teamName: team?.name || null },
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.send(renderOAuthResultPage({ type: 'vercel-oauth-success', accountLabel: team?.name || user.username }));
  } catch (error) {
    console.error('Vercel OAuth callback error:', error.message);
    res.send(renderOAuthResultPage({ type: 'vercel-oauth-error', message: 'Could not complete Vercel authorization. Please try again.' }));
  }
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
    const { projectExport } = await getVerifiedExportForDeployment(req.userId, websiteId);

    const connection = await GithubConnection.findOne({ userId: req.userId }).select('+accessTokenEncrypted');
    if (!connection) {
      return res.status(400).json({ success: false, message: 'Connect your GitHub account first.', requiresGithubConnection: true });
    }

    const accessToken = cryptoUtil.decrypt(connection.accessTokenEncrypted);
    const analysis = await analyzeRepository({ accessToken, owner: projectExport.repositoryOwner, repo: projectExport.repositoryName, branch: projectExport.defaultBranch });

    res.json({ success: true, data: analysis });
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
    const { purchase, projectExport } = await getVerifiedExportForDeployment(userId, websiteId);

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
    const analysis = await analyzeRepository({
      accessToken,
      owner: projectExport.repositoryOwner,
      repo: projectExport.repositoryName,
      branch: projectExport.defaultBranch,
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
      projectExportId: projectExport._id,
      repository: {
        owner: projectExport.repositoryOwner,
        name: projectExport.repositoryName,
        url: projectExport.repositoryUrl,
        defaultBranch: projectExport.defaultBranch,
      },
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
