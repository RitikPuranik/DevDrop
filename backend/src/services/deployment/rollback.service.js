'use strict';

const Deployment = require('../../modules/deployment/deployment.model');
const DeploymentVersion = require('../../modules/deployment/deploymentVersion.model');
const RollbackOperation = require('../../modules/deployment/rollbackOperation.model');
const vercelProvider = require('./providers/vercel.provider');
const { loadVercelContext, isVercelSite } = require('./vercelContext');
const { evaluateEligibility } = require('./rollbackEligibility');
const { ManagementError, fromVercelError } = require('./managementError');
const { classifyVercelError } = require('./vercelErrors');
const { setCurrentProduction, withOptionalTransaction } = require('./versionSync.service');
const { ROLLBACK_STATUS, DEPLOYMENT_ACTIVE_STATUSES } = require('../../shared/utils/constants');

/**
 * Rollback / promote orchestration.
 *
 * Lifecycle of one operation:
 *   pending -> requesting -> verifying -> succeeded | failed | verification_timeout | unverified
 *
 * Safety rules (see the feature spec, sections 2 / 6 / 8):
 *  - Authorization + ownership + project association + eligibility are all
 *    checked server-side against FRESH Vercel data before anything is sent.
 *  - Only the Vercel instant-rollback / promote endpoints are used, so the
 *    target deployment is restored as-is (no rebuild) and "v2" really means
 *    that exact deployment, not "one step back".
 *  - The rollback/promote POST is never blindly re-sent. If its outcome is
 *    unknown (timeout / 5xx) the operation goes to `verifying` and the real
 *    production state decides the result.
 *  - DevDrop only records a deployment as the active production deployment
 *    after Vercel's own project state says it is (targets.production.id), and
 *    never merely because the request was accepted.
 *  - A single active operation per Vercel project is enforced by a partial
 *    unique index; finalisation is guarded by a conditional update so a
 *    failed/duplicated finaliser cannot corrupt version history.
 */

const readInt = (key, fallback) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = () => ({
  verifyTimeoutMs: readInt('ROLLBACK_VERIFY_TIMEOUT_MS', 90 * 1000),
  verifyMinIntervalMs: readInt('ROLLBACK_VERIFY_MIN_INTERVAL_MS', 1500),
  staleRequestMs: readInt('ROLLBACK_STALE_REQUEST_MS', 60 * 1000),
  loopIntervalMs: readInt('ROLLBACK_VERIFY_LOOP_INTERVAL_MS', 2000),
});

const PENDING_JOB_STATUSES = new Set(['pending', 'in-progress', 'in_progress', 'queued', 'processing', 'running']);
const FAILED_JOB_STATUSES = new Set(['failed', 'error', 'timed-out', 'timed_out', 'timeout']);
const lc = (v) => String(v || '').toLowerCase();

const isDuplicateKey = (error) => error?.code === 11000;

const audit = (op, type, message, meta) => {
  const event = { at: new Date(), type, message: message ? String(message).slice(0, 500) : undefined, ...(meta ? { meta } : {}) };
  // Structured, secret-free line for log aggregation; the persisted copy is the durable audit trail.
  // eslint-disable-next-line no-console
  console.info('[deployment.audit]', JSON.stringify({ operationId: String(op._id), deploymentRef: String(op.deploymentRef), userId: String(op.userId), type, message: event.message, ...(meta ? { meta } : {}) }));
  return event;
};

const pushEvent = (opId, event, extraSet = {}, extra = {}) =>
  RollbackOperation.findOneAndUpdate(
    { _id: opId },
    { $push: { events: { $each: [event], $slice: -50 } }, ...(Object.keys(extraSet).length ? { $set: extraSet } : {}), ...extra },
    { new: true }
  );

// ───────────────────────── pre-flight ─────────────────────────

const markVersionUnavailable = (version) =>
  DeploymentVersion.updateOne({ _id: version._id }, { $set: { availability: 'unavailable' } }).catch(() => {});

/**
 * Fresh, authoritative eligibility check against Vercel. Also verifies the
 * connected credential can actually see the project and the deployment, and
 * that the deployment belongs to this site's Vercel project.
 */
const preflight = async (site, version, ctx) => {
  let production;
  try {
    production = await vercelProvider.getProductionState(ctx.credential, ctx.metadata, ctx.projectId);
  } catch (error) {
    const mapped = fromVercelError(error);
    if (mapped.code === 'VERCEL_NOT_FOUND') throw new ManagementError(404, 'PROJECT_NOT_FOUND', 'The connected Vercel project no longer exists or DevDrop can no longer access it.');
    throw mapped;
  }

  let fresh;
  try {
    fresh = await vercelProvider.getDeployment(ctx.credential, ctx.metadata, version.vercelDeploymentId);
  } catch (error) {
    const mapped = fromVercelError(error);
    if (mapped.code === 'VERCEL_NOT_FOUND' || mapped.code === 'VERCEL_GONE') {
      await markVersionUnavailable(version);
      throw new ManagementError(409, 'DEPLOYMENT_UNAVAILABLE', 'Vercel no longer has this deployment (it expired or was deleted), so it can\'t be restored.');
    }
    throw mapped;
  }

  // Keep the stored copy honest (state/substate can have changed since the last sync).
  await DeploymentVersion.updateOne(
    { _id: version._id },
    { $set: { state: fresh.state, readySubstate: fresh.readySubstate, environment: fresh.environment, availability: 'available' } }
  ).catch(() => {});

  const eligibility = evaluateEligibility(
    { environment: fresh.environment, state: fresh.state, readySubstate: fresh.readySubstate, projectId: fresh.projectId },
    { isCurrentProduction: production.currentDeploymentId === version.vercelDeploymentId, expectedProjectId: ctx.projectId }
  );

  return { production, fresh, eligibility };
};

const buildWarnings = ({ kind, production }) => {
  const warnings = [
    'Rolling back restores the selected deployment\'s build only. It does not revert Git commits, database migrations, data in external APIs, or any backend services (for example your Render API) that this site talks to.',
    'Environment variables are not rebuilt: the restored deployment keeps the values it was originally built with, even if you changed them in Vercel since.',
  ];
  if (kind === 'rollback') {
    warnings.push(
      'After an instant rollback, Vercel turns off automatic assignment of production domains. New pushes to your production branch will NOT go live until you promote a deployment in the Vercel dashboard (use "Undo Rollback") or run `vercel promote`.'
    );
  }
  if (production?.autoAssignCustomDomains === false && kind !== 'rollback') {
    warnings.push('Automatic assignment of production domains is already off for this project, so new pushes won\'t go live on their own.');
  }
  warnings.push('If you use custom domain aliases, they are only restored if they were attached to the deployment you roll back to.');
  return warnings;
};

/** Read-only check used by the confirmation dialog. Never changes anything. */
const getRollbackCheck = async (site, versionId) => {
  const version = await DeploymentVersion.findOne({ _id: versionId, deploymentRef: site._id, userId: site.userId });
  if (!version) throw new ManagementError(404, 'VERSION_NOT_FOUND', 'Deployment version not found.');
  const ctx = await loadVercelContext(site);
  const { production, eligibility } = await preflight(site, version, ctx);
  const current = production.currentDeploymentId
    ? await DeploymentVersion.findOne({ deploymentRef: site._id, vercelDeploymentId: production.currentDeploymentId }).select('versionNumber commitSha vercelCreatedAt url')
    : null;
  const active = await RollbackOperation.findOne({ vercelProjectId: ctx.projectId, active: true }).select('_id');
  return {
    eligible: eligibility.eligible && !active,
    kind: eligibility.kind,
    reason: eligibility.reason || (active ? { code: 'OPERATION_IN_PROGRESS', message: 'Another rollback is already in progress for this site.' } : null),
    operationInProgressId: active ? String(active._id) : null,
    currentProduction: current ? { versionNumber: current.versionNumber, label: `v${current.versionNumber}`, commitSha: current.commitSha, url: current.url } : null,
    productionStateKnown: Boolean(production.currentDeploymentId),
    autoAssignCustomDomains: production.autoAssignCustomDomains,
    warnings: eligibility.eligible ? buildWarnings({ kind: eligibility.kind, production }) : [],
    previewNote: 'Opening a deployment\'s unique URL works even though it is not live. If Vercel Deployment Protection is enabled on your project, you may be asked to sign in to Vercel to view it.',
  };
};

// ───────────────────────── operations ─────────────────────────

const failOperation = async (op, classified, { versionToMark } = {}) => {
  const event = audit(op, 'failed', classified.message, { code: classified.code, httpStatus: classified.httpStatus || undefined });
  const updated = await RollbackOperation.findOneAndUpdate(
    { _id: op._id, active: true },
    {
      $set: {
        status: ROLLBACK_STATUS.FAILED,
        active: false,
        completedAt: new Date(),
        error: { code: classified.code, message: String(classified.message).slice(0, 500), httpStatus: classified.httpStatus || undefined, retryable: Boolean(classified.retryable) },
      },
      $push: { events: { $each: [event], $slice: -50 } },
    },
    { new: true }
  );
  if (updated && versionToMark && ['NOT_FOUND', 'GONE'].includes(classified.code)) await markVersionUnavailable(versionToMark);
  return updated || RollbackOperation.findById(op._id);
};

/** Sends the (single) rollback/promote request for an operation that is `pending`. */
const issueRequest = async (op, ctx) => {
  const cfg = config();
  const claimed = await RollbackOperation.findOneAndUpdate(
    { _id: op._id, status: ROLLBACK_STATUS.PENDING },
    { $set: { status: ROLLBACK_STATUS.REQUESTING }, $push: { events: { $each: [audit(op, 'request_sent', `Requesting ${op.kind} to v${op.targetVersionNumber}`)], $slice: -50 } } },
    { new: true }
  );
  if (!claimed) return RollbackOperation.findById(op._id); // someone else already sent it — never send twice

  try {
    if (op.kind === 'promote') {
      await vercelProvider.requestPromote(ctx.credential, ctx.metadata, ctx.projectId, op.targetVercelDeploymentId);
    } else {
      await vercelProvider.requestRollback(ctx.credential, ctx.metadata, ctx.projectId, op.targetVercelDeploymentId, {
        description: `Restored v${op.targetVersionNumber} from DevDrop`,
      });
    }
    return pushEvent(
      op._id,
      audit(op, 'request_accepted', 'Vercel accepted the request; waiting for production to switch.'),
      { status: ROLLBACK_STATUS.VERIFYING, acceptedAt: new Date(), verifyDeadline: new Date(Date.now() + cfg.verifyTimeoutMs) }
    );
  } catch (error) {
    const classified = error?.vercel || classifyVercelError(error, op.kind);
    if (classified.outcomeUnknown) {
      // Vercel may have processed it. Do NOT re-send; let the real production state decide.
      return pushEvent(
        op._id,
        audit(op, 'request_outcome_unknown', `${classified.message} Checking Vercel's actual production state.`, { code: classified.code }),
        { status: ROLLBACK_STATUS.VERIFYING, outcomeUnknown: true, verifyDeadline: new Date(Date.now() + cfg.verifyTimeoutMs) }
      );
    }
    const version = await DeploymentVersion.findById(op.targetVersionId);
    return failOperation(op, classified, { versionToMark: version });
  }
};

const serializeOperation = (op) => {
  if (!op) return null;
  const steps = ['validated', 'requested', 'verifying', 'confirmed'];
  const reached = {
    [ROLLBACK_STATUS.PENDING]: 1,
    [ROLLBACK_STATUS.REQUESTING]: 1,
    [ROLLBACK_STATUS.VERIFYING]: 2,
    [ROLLBACK_STATUS.SUCCEEDED]: 4,
    [ROLLBACK_STATUS.VERIFICATION_TIMEOUT]: 3,
    [ROLLBACK_STATUS.UNVERIFIED]: 3,
    [ROLLBACK_STATUS.FAILED]: op.acceptedAt ? 3 : 1,
  }[op.status] || 1;

  const retryMode =
    !op.active && [ROLLBACK_STATUS.VERIFICATION_TIMEOUT, ROLLBACK_STATUS.UNVERIFIED].includes(op.status)
      ? 'verify'
      : !op.active && op.status === ROLLBACK_STATUS.FAILED && op.error?.retryable
        ? 'new'
        : null;

  return {
    id: String(op._id),
    kind: op.kind,
    status: op.status,
    active: Boolean(op.active),
    target: { versionId: String(op.targetVersionId), versionNumber: op.targetVersionNumber, label: `v${op.targetVersionNumber}` },
    previous: op.previousVersionNumber ? { versionId: op.previousVersionId ? String(op.previousVersionId) : null, versionNumber: op.previousVersionNumber, label: `v${op.previousVersionNumber}` } : null,
    progress: { steps, reached, percent: { 1: 15, 2: 65, 3: 85, 4: 100 }[reached] },
    requestedAt: op.requestedAt,
    acceptedAt: op.acceptedAt,
    completedAt: op.completedAt,
    verifyDeadline: op.verifyDeadline,
    outcomeUnknown: Boolean(op.outcomeUnknown),
    autoAssignAffected: op.autoAssignAffected,
    error: op.error?.code ? { code: op.error.code, message: op.error.message, retryable: Boolean(op.error.retryable) } : null,
    retry: retryMode ? { safe: true, mode: retryMode } : null,
    retryOf: op.retryOf ? String(op.retryOf) : null,
    events: (op.events || []).map((e) => ({ at: e.at, type: e.type, message: e.message })),
  };
};

const enqueueVerification = async (op, userId) => {
  try {
    const jobs = require('../../infrastructure/jobs');
    await jobs.enqueueRollbackVerification(op._id, userId);
  } catch (error) {
    // Best effort: status polling verifies lazily too, so a queue outage never strands an operation.
    console.warn(`[rollback] could not enqueue verification for ${op._id}: ${error.code || error.message}`);
  }
};

/**
 * Validates, records and starts a rollback/promote. Returns the operation
 * (status `verifying`, `failed`, ...) and whether it was an idempotent replay.
 */
const startOperation = async ({ site, versionId, idempotencyKey = null, reason = null, ip = null, retryOf = null, verifyOnly = false, kindOverride = null }) => {
  if (!isVercelSite(site)) throw new ManagementError(409, 'NOT_A_VERCEL_SITE', 'This deployment is not hosted on Vercel.');
  if (DEPLOYMENT_ACTIVE_STATUSES.includes(site.status)) {
    throw new ManagementError(409, 'DEPLOY_IN_PROGRESS', 'A deployment is currently running for this site. Wait for it to finish before rolling back.');
  }

  // Idempotent replay (double click / network retry with the same key).
  if (idempotencyKey) {
    const replay = await RollbackOperation.findOne({ deploymentRef: site._id, idempotencyKey });
    if (replay) return { operation: replay, idempotent: true };
  }

  // Ownership + association: the version must belong to THIS site and THIS user.
  const version = await DeploymentVersion.findOne({ _id: versionId, deploymentRef: site._id, userId: site.userId });
  if (!version) throw new ManagementError(404, 'VERSION_NOT_FOUND', 'Deployment version not found.');
  if (version.vercelProjectId !== site.vercel.projectId) {
    throw new ManagementError(409, 'PROJECT_MISMATCH', 'This deployment does not belong to the connected Vercel project.');
  }

  const active = await RollbackOperation.findOne({ vercelProjectId: site.vercel.projectId, active: true }).select('_id');
  if (active) throw new ManagementError(409, 'OPERATION_IN_PROGRESS', 'A rollback is already in progress for this site.', { operationId: String(active._id) });

  const ctx = await loadVercelContext(site);
  const { production, eligibility } = await preflight(site, version, ctx);
  if (!eligibility.eligible && !verifyOnly) {
    throw new ManagementError(422, eligibility.reason?.code || 'NOT_ELIGIBLE', eligibility.reason?.message || 'This deployment cannot be restored.', { reason: eligibility.reason });
  }

  const previous = production.currentDeploymentId
    ? await DeploymentVersion.findOne({ deploymentRef: site._id, vercelDeploymentId: production.currentDeploymentId }).select('_id versionNumber vercelDeploymentId')
    : null;

  const cfg = config();
  let op;
  try {
    op = await RollbackOperation.create({
      deploymentRef: site._id,
      userId: site.userId,
      vercelProjectId: site.vercel.projectId,
      kind: kindOverride || eligibility.kind || 'rollback',
      targetVersionId: version._id,
      targetVersionNumber: version.versionNumber,
      targetVercelDeploymentId: version.vercelDeploymentId,
      previousVersionId: previous?._id || null,
      previousVersionNumber: previous?.versionNumber || null,
      previousVercelDeploymentId: previous?.vercelDeploymentId || null,
      status: verifyOnly ? ROLLBACK_STATUS.VERIFYING : ROLLBACK_STATUS.PENDING,
      idempotencyKey: idempotencyKey || null,
      retryOf,
      reason: reason ? String(reason).slice(0, 200) : null,
      requestIp: ip ? String(ip).slice(0, 64) : null,
      ...(verifyOnly ? { acceptedAt: new Date(), outcomeUnknown: true, verifyDeadline: new Date(Date.now() + cfg.verifyTimeoutMs) } : {}),
      events: [{ at: new Date(), type: 'created', message: `${verifyOnly ? 'Re-verification' : 'Rollback'} to v${version.versionNumber} requested` }],
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    // Lost a race: either the same idempotency key or another active operation on this project.
    if (idempotencyKey) {
      const replay = await RollbackOperation.findOne({ deploymentRef: site._id, idempotencyKey });
      if (replay) return { operation: replay, idempotent: true };
    }
    const other = await RollbackOperation.findOne({ vercelProjectId: site.vercel.projectId, active: true }).select('_id');
    throw new ManagementError(409, 'OPERATION_IN_PROGRESS', 'A rollback is already in progress for this site.', { operationId: other ? String(other._id) : undefined });
  }

  audit(op, 'created', `kind=${op.kind} target=v${op.targetVersionNumber}`, { ip: op.requestIp || undefined });

  if (!verifyOnly) op = await issueRequest(op, ctx);
  if (op?.active) await enqueueVerification(op, site.userId);
  return { operation: op, idempotent: false };
};

// ───────────────────────── verification ─────────────────────────

const succeedOperation = async (op, site, state) => {
  const autoAssignAffected = state.autoAssignCustomDomains === false || (state.autoAssignCustomDomains === null && op.kind === 'rollback');
  return withOptionalTransaction(async (session) => {
    const sOpts = session ? { session } : {};
    // Claim finalisation: only one verifier wins; the rest see active=false and do nothing.
    const done = await RollbackOperation.findOneAndUpdate(
      { _id: op._id, active: true },
      {
        $set: { status: ROLLBACK_STATUS.SUCCEEDED, active: false, completedAt: new Date(), autoAssignAffected },
        $unset: { error: '' },
        $push: { events: { $each: [audit(op, 'confirmed', `Vercel confirms v${op.targetVersionNumber} is serving production.`)], $slice: -50 } },
      },
      { new: true, ...sOpts }
    );
    if (!done) return RollbackOperation.findById(op._id, null, sOpts);

    await setCurrentProduction(site, op.targetVercelDeploymentId, { session });
    await Deployment.updateOne(
      { _id: site._id },
      { $set: { 'versioning.autoAssignCustomDomains': state.autoAssignCustomDomains, 'versioning.productionCheckedAt': new Date() } },
      sOpts
    );
    return done;
  });
};

const settleWithoutSuccess = async (op, status, error, eventType, message) => {
  const event = audit(op, eventType, message, { code: error.code });
  return RollbackOperation.findOneAndUpdate(
    { _id: op._id, active: true },
    {
      $set: { status, active: false, completedAt: new Date(), error: { code: error.code, message: error.message, retryable: Boolean(error.retryable) } },
      $push: { events: { $each: [event], $slice: -50 } },
    },
    { new: true }
  ).then((updated) => updated || RollbackOperation.findById(op._id));
};

/**
 * One idempotent verification step. Safe to call from the status endpoint,
 * the background job, or both at once (a conditional touch ensures at most one
 * Vercel read per `verifyMinIntervalMs`, and finalisation is claimed atomically).
 */
const verifyOperation = async (operationId, { force = false } = {}) => {
  const cfg = config();
  let op = await RollbackOperation.findById(operationId);
  if (!op || !op.active) return op;

  const now = Date.now();

  // Process died between creating the operation and sending the request: nothing was sent.
  if (op.status === ROLLBACK_STATUS.PENDING && now - new Date(op.requestedAt).getTime() > cfg.staleRequestMs) {
    return failOperation(op, { code: 'REQUEST_NOT_SENT', message: 'The rollback was never sent to Vercel (the server restarted). Nothing changed — you can safely try again.', retryable: true });
  }
  // Died mid-request: we cannot know whether Vercel got it. Reconcile instead of re-sending.
  if (op.status === ROLLBACK_STATUS.REQUESTING && now - new Date(op.updatedAt || op.requestedAt).getTime() > cfg.staleRequestMs) {
    op = await pushEvent(op._id, audit(op, 'request_outcome_unknown', 'Request outcome unknown after a restart; checking production state.'), {
      status: ROLLBACK_STATUS.VERIFYING,
      outcomeUnknown: true,
      verifyDeadline: new Date(now + cfg.verifyTimeoutMs),
    });
  }
  if (op.status !== ROLLBACK_STATUS.VERIFYING) return op;

  // Throttle: claim this check slot atomically.
  if (!force) {
    const claimed = await RollbackOperation.findOneAndUpdate(
      { _id: op._id, active: true, $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(now - cfg.verifyMinIntervalMs) } }] },
      { $set: { lastCheckedAt: new Date(now) } },
      { new: true }
    );
    if (!claimed) return op;
    op = claimed;
  } else {
    await RollbackOperation.updateOne({ _id: op._id }, { $set: { lastCheckedAt: new Date(now) } });
  }

  const site = await Deployment.findById(op.deploymentRef);
  if (!site) return failOperation(op, { code: 'SITE_REMOVED', message: 'The deployment record no longer exists.', retryable: false });
  const pastDeadline = op.verifyDeadline && now > new Date(op.verifyDeadline).getTime();

  let state;
  try {
    const ctx = await loadVercelContext(site);
    state = await vercelProvider.getProductionState(ctx.credential, ctx.metadata, ctx.projectId);
  } catch (error) {
    if (!pastDeadline) return op; // transient read failure: keep waiting
    const e = error?.vercel || { code: error?.code || 'VERIFY_FAILED', message: error?.message || 'Could not read production state from Vercel.', retryable: true };
    return settleWithoutSuccess(op, ROLLBACK_STATUS.UNVERIFIED, { code: e.code, message: 'DevDrop could not confirm the result with Vercel. Check the Vercel dashboard to see which deployment is live.', retryable: true }, 'unverified', e.message);
  }

  const lar = state.lastAliasRequest;
  const aimedAtTarget = lar && lar.toDeploymentId === op.targetVercelDeploymentId;
  const aliasPending = aimedAtTarget && PENDING_JOB_STATUSES.has(lc(lar.jobStatus));
  const aliasFailed = aimedAtTarget && FAILED_JOB_STATUSES.has(lc(lar.jobStatus));
  const arrived = state.currentDeploymentId === op.targetVercelDeploymentId;

  if (aliasFailed) {
    let detail = '';
    try {
      const ctx = await loadVercelContext(site);
      const failed = await vercelProvider.getPromoteAliases(ctx.credential, ctx.metadata, ctx.projectId, { failedOnly: true, limit: 10 });
      if (failed.length) detail = ` Domains that could not be switched: ${failed.map((a) => a.alias).slice(0, 5).join(', ')}.`;
    } catch { /* detail is optional */ }
    return failOperation(op, {
      code: 'ALIAS_ASSIGNMENT_FAILED',
      message: `Vercel accepted the request but could not point your production domains at this deployment.${detail} Check the domain configuration in Vercel.`,
      retryable: false,
    });
  }

  if (arrived && !aliasPending) return succeedOperation(op, site, state);

  if (pastDeadline) {
    if (!op.acceptedAt && op.outcomeUnknown && !aimedAtTarget && !arrived) {
      return failOperation(op, { code: 'REQUEST_NOT_ACCEPTED', message: 'Vercel does not appear to have received the request (production was not changed). You can safely try again.', retryable: true });
    }
    if (!state.currentDeploymentId) {
      return settleWithoutSuccess(op, ROLLBACK_STATUS.UNVERIFIED, { code: 'PRODUCTION_STATE_UNKNOWN', message: 'Vercel did not report which deployment is serving production, so DevDrop cannot confirm the result. Check the Vercel dashboard.', retryable: true }, 'unverified', 'Production state not reported by Vercel');
    }
    return settleWithoutSuccess(op, ROLLBACK_STATUS.VERIFICATION_TIMEOUT, { code: 'VERIFICATION_TIMEOUT', message: 'Vercel accepted the request but production had not switched within the expected time. It may still complete — re-check to confirm.', retryable: true }, 'verification_timeout', 'Verification timed out');
  }

  return op;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Used by the background job: verify until the operation settles (bounded by its verifyDeadline). */
const runVerificationLoop = async (operationId, { sleepFn = sleep } = {}) => {
  const cfg = config();
  // The deadline bounds the loop; the extra margin only protects against a missing deadline.
  const hardStop = Date.now() + cfg.verifyTimeoutMs + 30 * 1000;
  for (;;) {
    const op = await verifyOperation(operationId, { force: false });
    if (!op || !op.active) return op;
    if (Date.now() > hardStop) return op;
    await sleepFn(cfg.loopIntervalMs);
  }
};

// ───────────────────────── reads / retry ─────────────────────────

const getOperation = async (site, operationId, { verify = true } = {}) => {
  let op = await RollbackOperation.findOne({ _id: operationId, deploymentRef: site._id, userId: site.userId });
  if (!op) throw new ManagementError(404, 'OPERATION_NOT_FOUND', 'Rollback operation not found.');
  if (verify && op.active) {
    op = (await verifyOperation(op._id)) || op;
  }
  return op;
};

const listOperations = async (site, { limit = 10 } = {}) =>
  RollbackOperation.find({ deploymentRef: site._id, userId: site.userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 25));

const getActiveOperation = (site) =>
  RollbackOperation.findOne({ deploymentRef: site._id, userId: site.userId, active: true });

/**
 * Safe retry. After a timeout/unverified result the request may already have
 * been applied, so the retry only RE-VERIFIES. After a definitive pre-acceptance
 * failure (e.g. Vercel 5xx / rate limit) it runs the full flow again, including a
 * fresh pre-flight.
 */
const retryOperation = async ({ site, operationId, ip }) => {
  const prev = await RollbackOperation.findOne({ _id: operationId, deploymentRef: site._id, userId: site.userId });
  if (!prev) throw new ManagementError(404, 'OPERATION_NOT_FOUND', 'Rollback operation not found.');
  if (prev.active) throw new ManagementError(409, 'OPERATION_IN_PROGRESS', 'This operation is still running.', { operationId: String(prev._id) });

  const verifyOnly = [ROLLBACK_STATUS.VERIFICATION_TIMEOUT, ROLLBACK_STATUS.UNVERIFIED].includes(prev.status);
  const retryableFailure = prev.status === ROLLBACK_STATUS.FAILED && prev.error?.retryable;
  if (!verifyOnly && !retryableFailure) {
    throw new ManagementError(409, 'NOT_RETRYABLE', 'This operation can\'t be retried automatically. Start a new rollback instead.');
  }
  return startOperation({ site, versionId: prev.targetVersionId, ip, retryOf: prev._id, verifyOnly, reason: prev.reason, kindOverride: verifyOnly ? prev.kind : null });
};

module.exports = {
  config,
  preflight,
  getRollbackCheck,
  startOperation,
  verifyOperation,
  runVerificationLoop,
  getOperation,
  listOperations,
  getActiveOperation,
  retryOperation,
  serializeOperation,
  buildWarnings,
};
