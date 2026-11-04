const Deployment = require('./deployment.model');
const DeploymentVersion = require('./deploymentVersion.model');
const versionSync = require('../../services/deployment/versionSync.service');
const rollbackService = require('../../services/deployment/rollback.service');
const logsService = require('../../services/deployment/deploymentLogs.service');
const { isVercelSite } = require('../../services/deployment/vercelContext');
const { ManagementError } = require('../../services/deployment/managementError');

const respondError = (res, error) => {
  if (error instanceof ManagementError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      operationId: error.operationId,
      reason: error.reason,
      snapshotAt: error.snapshotAt,
    });
  }
  console.error('[deployment-versions] unexpected error:', error);
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
};

// Ownership gate: every query is scoped by the authenticated user, never by client-supplied owner/project ids.
const loadOwnedSite = async (req) => {
  const site = await Deployment.findOne({ _id: req.params.deploymentId, userId: req.userId });
  if (!site) throw new ManagementError(404, 'DEPLOYMENT_NOT_FOUND', 'Deployment not found.');
  return site;
};

const loadOwnedVersion = async (site, versionId) => {
  const version = await DeploymentVersion.findOne({ _id: versionId, deploymentRef: site._id, userId: site.userId });
  if (!version) throw new ManagementError(404, 'VERSION_NOT_FOUND', 'Deployment version not found.');
  return version;
};

const buildListPayload = async (site, query, { synced }) => {
  const fresh = (await Deployment.findById(site._id).select('versioning status')) || site;
  const [{ versions, nextCursor }, summary, active] = await Promise.all([
    versionSync.listVersions(site, query),
    versionSync.getSummary(site._id),
    rollbackService.getActiveOperation(site),
  ]);
  const v = fresh.versioning || {};
  return {
    supported: true,
    versions: versions.map((x) => versionSync.serializeVersion(x, summary)),
    nextCursor,
    summary,
    sync: { lastSyncedAt: v.lastSyncedAt || null, error: v.lastSyncError || null, historyTruncated: Boolean(v.historyTruncated), refreshed: Boolean(synced) },
    autoAssign: { enabled: v.autoAssignCustomDomains ?? null, paused: v.autoAssignCustomDomains === false },
    deployInProgress: ['ANALYZING', 'QUEUED', 'DEPLOYING_BACKEND', 'BACKEND_DEPLOYED', 'DEPLOYING_FRONTEND', 'FRONTEND_DEPLOYED', 'SYNCHRONIZING_ENV', 'REDEPLOYING_BACKEND'].includes(fresh.status),
    activeOperation: active ? rollbackService.serializeOperation(active) : null,
  };
};

/** GET /api/deployments/:deploymentId/versions */
const listVersions = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    if (!isVercelSite(site)) {
      return res.json({ success: true, data: { supported: false, reason: 'This deployment is not hosted on Vercel, so version history is not available.', versions: [] } });
    }
    let synced = false;
    if (!req.query.cursor && req.query.sync !== '0') {
      const result = await versionSync.syncSite(site);
      synced = Boolean(result.synced);
    }
    res.json({ success: true, data: await buildListPayload(site, req.query, { synced }) });
  } catch (error) {
    respondError(res, error);
  }
};

/** POST /api/deployments/:deploymentId/versions/sync */
const syncVersions = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    if (!isVercelSite(site)) throw new ManagementError(409, 'NOT_A_VERCEL_SITE', 'This deployment is not hosted on Vercel.');
    const result = await versionSync.syncSite(site, { force: true });
    if (!result.synced && result.error) throw new ManagementError(502, result.error, 'DevDrop could not refresh from Vercel right now.', { retryable: true });
    res.json({ success: true, data: await buildListPayload(site, { limit: req.query.limit }, { synced: result.synced }) });
  } catch (error) {
    respondError(res, error);
  }
};

/** GET /api/deployments/:deploymentId/versions/:versionId */
const getVersion = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const version = await loadOwnedVersion(site, req.params.versionId);
    const summary = await versionSync.getSummary(site._id);
    res.json({ success: true, data: { ...versionSync.serializeVersion(version, summary), logs: logsService.describeAvailability(version) } });
  } catch (error) {
    respondError(res, error);
  }
};

/** GET /api/deployments/:deploymentId/versions/:versionId/rollback-check */
const rollbackCheck = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    res.json({ success: true, data: await rollbackService.getRollbackCheck(site, req.params.versionId) });
  } catch (error) {
    respondError(res, error);
  }
};

/** POST /api/deployments/:deploymentId/rollback  body: { versionId, confirm: true, idempotencyKey?, reason? } */
const createRollback = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const { operation, idempotent } = await rollbackService.startOperation({
      site,
      versionId: req.body.versionId,
      idempotencyKey: req.body.idempotencyKey || null,
      reason: req.body.reason || null,
      ip: req.ip,
    });
    res.status(idempotent ? 200 : 202).json({ success: true, idempotent, data: rollbackService.serializeOperation(operation) });
  } catch (error) {
    respondError(res, error);
  }
};

/** GET /api/deployments/:deploymentId/rollback/:operationId */
const getOperation = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const op = await rollbackService.getOperation(site, req.params.operationId);
    res.json({ success: true, data: rollbackService.serializeOperation(op) });
  } catch (error) {
    respondError(res, error);
  }
};

/** GET /api/deployments/:deploymentId/rollbacks */
const listOperations = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const ops = await rollbackService.listOperations(site, { limit: req.query.limit });
    res.json({ success: true, data: ops.map(rollbackService.serializeOperation) });
  } catch (error) {
    respondError(res, error);
  }
};

/** POST /api/deployments/:deploymentId/rollback/:operationId/retry */
const retryOperation = async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const { operation } = await rollbackService.retryOperation({ site, operationId: req.params.operationId, ip: req.ip });
    res.status(202).json({ success: true, data: rollbackService.serializeOperation(operation) });
  } catch (error) {
    respondError(res, error);
  }
};

const logsHandler = (forcedType) => async (req, res) => {
  try {
    const site = await loadOwnedSite(req);
    const version = await loadOwnedVersion(site, req.params.versionId);
    const data = await logsService.getLogs(site, version, { ...req.query, type: forcedType || req.query.type, refresh: req.query.refresh === 'true' || req.query.refresh === '1' });
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (error) {
    respondError(res, error);
  }
};

module.exports = {
  listVersions,
  syncVersions,
  getVersion,
  rollbackCheck,
  createRollback,
  getOperation,
  listOperations,
  retryOperation,
  getLogs: logsHandler(null),
  getBuildLogs: logsHandler('build'),
};
