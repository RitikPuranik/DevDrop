const Deployment = require('../../modules/deployment/deployment.model');
const DeploymentProviderConnection = require('../../modules/deployment/deploymentProviderConnection.model');
const cryptoUtil = require('../../shared/utils/crypto');
const { getProvider } = require('./providers/provider.factory');
const { buildVariableList } = require('./envSync');
const { DEPLOYMENT_STATUS } = require('../../shared/utils/constants');

const readEnvNumber = (key, fallback) => {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) ? value : fallback;
};

const POLL_INTERVAL_MS = readEnvNumber('DEPLOY_POLL_INTERVAL_MS', 5000);
const POLL_TIMEOUT_MS = readEnvNumber('DEPLOY_POLL_TIMEOUT_MS', 8 * 60 * 1000); // 8 min per leg

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const providerLabel = (name) => ({ vercel: 'Vercel', render: 'Render' }[name] || name);

const STEP_LABELS = {
  [DEPLOYMENT_STATUS.DEPLOYING_BACKEND]: 'Deploying backend',
  [DEPLOYMENT_STATUS.DEPLOYING_FRONTEND]: 'Deploying frontend',
  [DEPLOYMENT_STATUS.SYNCHRONIZING_ENV]: 'Synchronizing environment variables',
  [DEPLOYMENT_STATUS.REDEPLOYING_BACKEND]: 'Redeploying backend',
};
const humanizeStep = (status) => STEP_LABELS[status] || status;

const loadConnection = async (userId, providerName) => {
  const connection = await DeploymentProviderConnection.findOne({ userId, provider: providerName }).select('+credentialEncrypted');
  if (!connection) {
    throw Object.assign(new Error(`${providerLabel(providerName)} isn't connected yet. Connect it under Connected Accounts and try again.`), {
      provider: providerName,
    });
  }
  const credential = cryptoUtil.decrypt(connection.credentialEncrypted);
  return { credential, metadata: connection.metadata || {} };
};

const pollUntilTerminal = async (fn) => {
  const startedAt = Date.now();
  // Loop rather than recurse — a build can run for minutes and we don't
  // want a deep call stack sitting around for the whole poll.
  for (;;) {
    const result = await fn();
    if (result.isTerminal) return result;
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw Object.assign(new Error('the provider took too long to finish building'), { code: 'TIMEOUT' });
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

const friendlyErrorMessage = (error, status) => {
  const step = humanizeStep(status);
  if (error.code === 'TIMEOUT') {
    return `${step}: the provider took too long to finish building. It may still complete on their end — check the provider's dashboard, or try Redeploy shortly.`;
  }
  if (error.status === 401 || error.status === 403) {
    const who = error.provider ? providerLabel(error.provider) : 'the provider';
    return `${step}: DevDrop's connection to ${who} was rejected. Reconnect it under Connected Accounts and try again.`;
  }
  if (error.status === 429) {
    const who = error.provider ? providerLabel(error.provider) : 'The provider';
    return `${step}: ${who} rate-limited this request. Please try again in a few minutes.`;
  }
  return `${step}: ${error.message || 'an unexpected error occurred'}`;
};

const buildResourceName = (deployment, side) => {
  const base = (deployment.repository.name || 'devdrop-project')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return side === 'frontend' ? base : `${base}-api`;
};

const markEnvConfigured = (deployment, target, pushedVars) => {
  const pushedKeys = new Set(pushedVars.map((v) => v.key));
  deployment.envPlan.forEach((entry) => {
    if (entry.target === target && pushedKeys.has(entry.key)) entry.configured = true;
  });
  deployment.markModified('envPlan');
};

const decryptPendingSecrets = (deployment) => {
  if (!deployment.pendingSecretsEncrypted) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(cryptoUtil.decrypt(deployment.pendingSecretsEncrypted))));
  } catch {
    // Required-variable validation already ran when the deployment was
    // created, so treating an undecryptable blob as "no secrets" fails a
    // step cleanly downstream rather than crashing the whole run here.
    return new Map();
  }
};

/**
 * Runs (or resumes) one deployment: backend first if it has one, then
 * frontend, then — only for true fullstack deployments — a backend resync
 * once the frontend's URL is known (spec's two-phase deployment, §16).
 *
 * Safe to call again on a deployment that already has partial provider
 * resources attached (redeploy / retry after failure): every provider call
 * looks its resource up by stored ID before creating a new one, so this
 * never produces a second Vercel project or Render service for the same
 * Deployment document (§39, idempotency).
 */
const runDeployment = async (deploymentId) => {
  const deployment = await Deployment.findById(deploymentId).select('+pendingSecretsEncrypted');
  if (!deployment) return; // record was removed out from under us
  if (deployment.status === DEPLOYMENT_STATUS.CANCELLED) return;

  const userSecrets = decryptPendingSecrets(deployment);
  const context = {
    frontendUrl: deployment.vercel?.url || null,
    backendUrl: deployment.render?.url || null,
    userSecrets,
  };

  try {
    // ---- Phase 1: backend ----
    if (deployment.backendProvider) {
      deployment.status = DEPLOYMENT_STATUS.DEPLOYING_BACKEND;
      await deployment.save();

      const { credential, metadata } = await loadConnection(deployment.userId, deployment.backendProvider);
      const provider = getProvider(deployment.backendProvider);

      const service = await provider.ensureProject(
        credential,
        metadata,
        {
          serviceName: buildResourceName(deployment, 'backend'),
          repoOwner: deployment.repository.owner,
          repoName: deployment.repository.name,
          branch: deployment.repository.defaultBranch,
          rootDirectory: deployment.analysis?.backend?.rootDirectory,
          buildCommand: deployment.analysis?.backend?.buildCommand,
          startCommand: deployment.analysis?.backend?.startCommand,
        },
        { serviceId: deployment.render.serviceId }
      );
      deployment.render.serviceId = service.serviceId;
      deployment.render.ownerId = metadata.ownerId;
      await deployment.save();

      const backendVars = buildVariableList(deployment.envPlan, 'backend', context);
      await provider.configureEnvironment(credential, metadata, service.serviceId, backendVars);

      const { deployId } = await provider.deploy(credential, metadata, service);
      deployment.render.deployId = deployId;
      await deployment.save();

      const result = await pollUntilTerminal(() => provider.getDeploymentStatus(credential, metadata, service.serviceId, deployId));
      if (!result.isSuccess) {
        throw Object.assign(new Error(`Render build did not succeed (status: ${result.state}).`), { provider: 'render' });
      }

      deployment.render.url = result.url;
      context.backendUrl = result.url;
      markEnvConfigured(deployment, 'backend', backendVars);
      deployment.status = DEPLOYMENT_STATUS.BACKEND_DEPLOYED;
      await deployment.save();
    }

    // ---- Phase 2: frontend ----
    if (deployment.frontendProvider) {
      deployment.status = DEPLOYMENT_STATUS.DEPLOYING_FRONTEND;
      await deployment.save();

      const { credential, metadata } = await loadConnection(deployment.userId, deployment.frontendProvider);
      const provider = getProvider(deployment.frontendProvider);

      const project = await provider.ensureProject(
        credential,
        metadata,
        {
          projectName: buildResourceName(deployment, 'frontend'),
          framework: deployment.analysis?.frontend?.framework,
          repoOwner: deployment.repository.owner,
          repoName: deployment.repository.name,
          rootDirectory: deployment.analysis?.frontend?.rootDirectory,
          buildCommand: deployment.analysis?.frontend?.buildCommand,
          outputDirectory: deployment.analysis?.frontend?.outputDirectory,
          installCommand: deployment.analysis?.frontend?.installCommand,
        },
        { projectId: deployment.vercel.projectId }
      );
      deployment.vercel.projectId = project.projectId;
      deployment.vercel.projectName = project.projectName;
      deployment.vercel.teamId = metadata.teamId || null;
      await deployment.save();

      const frontendVars = buildVariableList(deployment.envPlan, 'frontend', context);
      await provider.configureEnvironment(credential, metadata, project.projectId, frontendVars);

      const { deployId } = await provider.deploy(credential, metadata, project, { branch: deployment.repository.defaultBranch });
      deployment.vercel.deploymentId = deployId;
      await deployment.save();

      const result = await pollUntilTerminal(() => provider.getDeploymentStatus(credential, metadata, deployId));
      if (!result.isSuccess) {
        throw Object.assign(new Error(`Vercel build did not succeed (status: ${result.state}).`), { provider: 'vercel' });
      }

      deployment.vercel.url = result.url;
      context.frontendUrl = result.url;
      markEnvConfigured(deployment, 'frontend', frontendVars);
      deployment.status = DEPLOYMENT_STATUS.FRONTEND_DEPLOYED;
      await deployment.save();
    }

    // ---- Phase 3: resync backend now that the frontend URL exists ----
    // Only needed the first time — a redeploy where both URLs were already
    // known going in has nothing new to synchronize.
    const backendAwaitingFrontendUrl = deployment.envPlan.some(
      (e) => e.target === 'backend' && e.autoRole === 'frontend-url' && !e.configured
    );
    if (deployment.backendProvider && deployment.frontendProvider && backendAwaitingFrontendUrl) {
      deployment.status = DEPLOYMENT_STATUS.SYNCHRONIZING_ENV;
      await deployment.save();

      const { credential, metadata } = await loadConnection(deployment.userId, deployment.backendProvider);
      const provider = getProvider(deployment.backendProvider);

      const backendVars = buildVariableList(deployment.envPlan, 'backend', context);
      await provider.configureEnvironment(credential, metadata, deployment.render.serviceId, backendVars);

      deployment.status = DEPLOYMENT_STATUS.REDEPLOYING_BACKEND;
      await deployment.save();

      const { deployId } = await provider.deploy(credential, metadata, { serviceId: deployment.render.serviceId });
      deployment.render.deployId = deployId;
      await deployment.save();

      const result = await pollUntilTerminal(() =>
        provider.getDeploymentStatus(credential, metadata, deployment.render.serviceId, deployId)
      );
      if (!result.isSuccess) {
        throw Object.assign(new Error(`Render redeploy did not succeed (status: ${result.state}).`), { provider: 'render' });
      }

      markEnvConfigured(deployment, 'backend', backendVars);
    }

    deployment.status = DEPLOYMENT_STATUS.SUCCESS;
    deployment.lastDeployedAt = new Date();
    deployment.errorMessage = undefined;
    deployment.errorStep = undefined;
    deployment.pendingSecretsEncrypted = null;
    await deployment.save();
  } catch (error) {
    const failedStep = deployment.status;
    deployment.status = DEPLOYMENT_STATUS.FAILED;
    deployment.errorStep = failedStep;
    deployment.errorMessage = friendlyErrorMessage(error, failedStep);
    // eslint-disable-next-line no-console
    console.error(`[deployment.orchestrator] Deployment ${deployment._id} failed at ${failedStep}:`, error);
    await deployment.save().catch((saveError) => {
      // eslint-disable-next-line no-console
      console.error(`[deployment.orchestrator] Failed to persist failure state for ${deployment._id}:`, saveError);
    });
  }
};

module.exports = { runDeployment };
