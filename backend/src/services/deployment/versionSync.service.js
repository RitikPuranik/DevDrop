'use strict';

const mongoose = require('mongoose');
const Deployment = require('../../modules/deployment/deployment.model');
const DeploymentVersion = require('../../modules/deployment/deploymentVersion.model');
const vercelProvider = require('./providers/vercel.provider');
const { loadVercelContext, isVercelSite } = require('./vercelContext');
const { ManagementError } = require('./managementError');
const { VERSION_STATE } = require('../../shared/utils/constants');

/**
 * Keeps DeploymentVersion documents in step with the real Vercel project.
 *
 *  - Vercel is the source of truth for deployments and for "what serves
 *    production"; DevDrop stores a persistent version-number mapping on top.
 *  - Version numbers are chronological per site, assigned once, never reused.
 *  - History is never deleted when newer deployments appear.
 *  - Reads from Vercel are bounded (pages x 100 deployments).
 */

const readInt = (key, fallback) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = () => ({
  staleMs: readInt('VERSION_SYNC_STALE_MS', 30 * 1000), // GET /versions re-syncs at most this often
  leaseMs: readInt('VERSION_SYNC_LEASE_MS', 45 * 1000),
  initialPages: readInt('VERSION_SYNC_INITIAL_PAGES', 3), // first sync reads up to 3 x 100 deployments
  pageSize: 100,
});

const isDuplicateKey = (error) => error?.code === 11000;
const toDate = (ms) => (ms ? new Date(ms) : null);

/** Runs fn inside a transaction when the deployment supports them (replica set / Atlas); otherwise just runs it. */
const withOptionalTransaction = async (fn) => {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    const unsupported = error?.code === 20 || /replica set|transaction numbers|Transactions are not supported/i.test(String(error?.message || ''));
    if (!unsupported) throw error;
    return fn(null);
  } finally {
    if (session) await session.endSession().catch(() => {});
  }
};

const versionFields = (n) => ({
  url: n.url,
  commitSha: n.commitSha,
  commitMessage: n.commitMessage ? String(n.commitMessage).slice(0, 500) : null,
  commitRef: n.commitRef,
  environment: n.environment,
  state: n.state,
  readySubstate: n.readySubstate,
  buildingAt: toDate(n.buildingAt),
  readyAt: toDate(n.readyAt),
  durationMs: n.durationMs,
  errorCode: n.errorCode,
  errorMessage: n.errorMessage ? String(n.errorMessage).slice(0, 500) : null,
  availability: 'available',
  lastSyncedAt: new Date(),
});

// ───────────────────────── lease ─────────────────────────

const acquireLease = async (siteId, leaseMs) => {
  const now = new Date();
  const doc = await Deployment.findOneAndUpdate(
    {
      _id: siteId,
      $or: [{ 'versioning.syncLockUntil': null }, { 'versioning.syncLockUntil': { $lt: now } }, { 'versioning.syncLockUntil': { $exists: false } }],
    },
    { $set: { 'versioning.syncLockUntil': new Date(now.getTime() + leaseMs) } },
    { new: true }
  );
  return Boolean(doc);
};

const releaseLease = (siteId, extraSet = {}) =>
  Deployment.updateOne({ _id: siteId }, { $set: { 'versioning.syncLockUntil': null, ...extraSet } }).catch(() => {});

// ───────────────────────── production pointer ─────────────────────────

/**
 * Makes exactly one version the "current production" one, atomically
 * (transaction when available; otherwise an ordered clear-then-set that the
 * partial unique index keeps safe). Returns the newly-current version, or
 * null when `vercelDeploymentId` isn't in DevDrop's history.
 *
 * Pass `{ session }` to join a caller's transaction (null = caller already
 * determined transactions are unavailable).
 */
const setCurrentProduction = async (site, vercelDeploymentId, { session } = {}) => {
  if (!vercelDeploymentId) return null;

  const run = async (sess) => {
    const opts = sess ? { session: sess } : {};
    const target = await DeploymentVersion.findOne({ deploymentRef: site._id, vercelDeploymentId }, null, opts);
    if (!target) return null;
    if (!target.isCurrentProduction) {
      await DeploymentVersion.updateMany(
        { deploymentRef: site._id, isCurrentProduction: true, _id: { $ne: target._id } },
        { $set: { isCurrentProduction: false } },
        opts
      );
      await DeploymentVersion.updateOne(
        { _id: target._id },
        { $set: { isCurrentProduction: true, lastProductionAt: new Date() } },
        opts
      );
      target.isCurrentProduction = true;
    }
    return target;
  };

  if (session !== undefined) return run(session);

  try {
    return await withOptionalTransaction(run);
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    // Lost a race with another finalizer: re-run once; the index guarantees a single winner.
    return withOptionalTransaction(run);
  }
};

// ───────────────────────── sync ─────────────────────────

const insertNewVersions = async (site, fresh, hintId) => {
  if (!fresh.length) return 0;
  // Chronological numbering: oldest new deployment gets the lowest new number.
  const ordered = [...fresh].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const bumped = await Deployment.findOneAndUpdate({ _id: site._id }, { $inc: { 'versioning.seq': ordered.length } }, { new: true });
  const start = (bumped?.versioning?.seq || ordered.length) - ordered.length + 1;

  const docs = ordered.map((n, i) => ({
    deploymentRef: site._id,
    userId: site.userId,
    websiteId: site.websiteId || null,
    vercelProjectId: site.vercel.projectId,
    vercelDeploymentId: n.id,
    versionNumber: start + i,
    vercelCreatedAt: new Date(n.createdAt || Date.now()),
    origin: n.id === hintId || n.id === site.vercel?.deploymentId ? 'devdrop' : 'external',
    ...versionFields(n),
  }));

  try {
    await DeploymentVersion.insertMany(docs, { ordered: false });
  } catch (error) {
    // Duplicate keys mean another writer already stored some of these; everything else is a real failure.
    const writeErrors = error?.writeErrors || [];
    const onlyDuplicates = isDuplicateKey(error) || (writeErrors.length > 0 && writeErrors.every((e) => e.code === 11000 || e.err?.code === 11000));
    if (!onlyDuplicates) throw error;
  }
  return docs.length;
};

/**
 * Reconciles one site's version history with Vercel.
 *
 * @param {object} site Deployment document
 * @param {{force?:boolean, hintDeploymentId?:string}} [opts]
 * @returns {Promise<{synced:boolean, skipped?:string, created?:number, updated?:number, productionChanged?:boolean, error?:string}>}
 */
const syncSite = async (site, { force = false, hintDeploymentId = null } = {}) => {
  const cfg = config();
  if (!isVercelSite(site)) return { synced: false, skipped: 'not_vercel' };

  const last = site.versioning?.lastSyncedAt ? new Date(site.versioning.lastSyncedAt).getTime() : 0;
  if (!force && Date.now() - last < cfg.staleMs) return { synced: false, skipped: 'fresh' };

  if (!(await acquireLease(site._id, cfg.leaseMs))) return { synced: false, skipped: 'locked' };

  try {
    const ctx = await loadVercelContext(site);
    const knownCount = await DeploymentVersion.countDocuments({ deploymentRef: site._id });
    const firstSync = knownCount === 0;

    // 1. Newest page always; older pages only on the very first (backfill) sync.
    const fetched = [];
    let until;
    let next = null;
    const maxPages = firstSync ? cfg.initialPages : 1;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await vercelProvider.listDeploymentsPage(ctx.credential, ctx.metadata, ctx.projectId, { limit: cfg.pageSize, until });
      fetched.push(...result.deployments);
      next = result.next;
      if (!next || result.deployments.length < cfg.pageSize) { next = null; break; }
      until = next;
    }
    const historyTruncated = firstSync ? Boolean(next) : Boolean(site.versioning?.historyTruncated);

    // Only deployments that demonstrably belong to this project.
    const belonging = fetched.filter((d) => d.id && (!d.projectId || d.projectId === ctx.projectId));
    const byId = new Map(belonging.map((d) => [d.id, d]));

    // A hinted/known-current deployment may be older than the page we read.
    const production = await vercelProvider.getProductionState(ctx.credential, ctx.metadata, ctx.projectId).catch((e) => ({ error: e }));
    const wantedIds = [hintDeploymentId, production.currentDeploymentId].filter(Boolean);
    for (const id of wantedIds) {
      if (byId.has(id)) continue;
      const known = await DeploymentVersion.exists({ deploymentRef: site._id, vercelDeploymentId: id });
      if (known && id !== hintDeploymentId) continue;
      try {
        const single = await vercelProvider.getDeployment(ctx.credential, ctx.metadata, id);
        if (single.id && (!single.projectId || single.projectId === ctx.projectId)) byId.set(single.id, single);
      } catch {
        // Not fatal: it simply stays out of history until Vercel returns it.
      }
    }

    // 2. Split into new vs. existing, update existing in place, insert new with chronological numbers.
    const incoming = [...byId.values()];
    const existing = await DeploymentVersion.find({ deploymentRef: site._id, vercelDeploymentId: { $in: incoming.map((d) => d.id) } }).select('vercelDeploymentId');
    const existingIds = new Set(existing.map((e) => e.vercelDeploymentId));

    const updates = incoming
      .filter((d) => existingIds.has(d.id))
      .map((d) => ({ updateOne: { filter: { deploymentRef: site._id, vercelDeploymentId: d.id }, update: { $set: versionFields(d) } } }));
    if (updates.length) await DeploymentVersion.bulkWrite(updates, { ordered: false });

    const created = await insertNewVersions(site, incoming.filter((d) => !existingIds.has(d.id)), hintDeploymentId);

    // 3. Production pointer comes from Vercel's project state, never from a request being accepted.
    let productionChanged = false;
    const setOnSite = { 'versioning.lastSyncedAt': new Date(), 'versioning.lastSyncError': null, 'versioning.historyTruncated': historyTruncated };
    if (!production.error) {
      setOnSite['versioning.productionCheckedAt'] = new Date();
      if (production.currentDeploymentId) {
        const before = await DeploymentVersion.findOne({ deploymentRef: site._id, isCurrentProduction: true }).select('vercelDeploymentId');
        const now = await setCurrentProduction(site, production.currentDeploymentId);
        productionChanged = Boolean(now) && before?.vercelDeploymentId !== production.currentDeploymentId;
      }
    }

    await releaseLease(site._id, setOnSite);
    return { synced: true, created, updated: updates.length, productionChanged, productionKnown: !production.error && Boolean(production.currentDeploymentId) };
  } catch (error) {
    await releaseLease(site._id, { 'versioning.lastSyncError': String(error.vercel?.code || error.code || 'SYNC_FAILED').slice(0, 60) });
    if (error instanceof ManagementError) return { synced: false, error: error.code };
    return { synced: false, error: error.vercel?.code || 'SYNC_FAILED' };
  }
};

/**
 * Webhook entry point: a Vercel event told us something changed for a
 * deployment in a project. The event body is only a hint — state is always
 * re-read from Vercel, so a forged/stale payload can't change DevDrop's data.
 */
const reconcileProjectDeployment = async (vercelProjectId, vercelDeploymentId) => {
  const sites = await Deployment.find({ 'vercel.projectId': vercelProjectId, frontendProvider: 'vercel' });
  const results = [];
  for (const site of sites) {
    results.push(await syncSite(site, { force: true, hintDeploymentId: vercelDeploymentId }));
  }
  return { sites: sites.length, results };
};

// ───────────────────────── reads ─────────────────────────

const getSummary = async (siteId) => {
  const [latest, latestSuccessful, currentProduction] = await Promise.all([
    DeploymentVersion.findOne({ deploymentRef: siteId }).sort({ vercelCreatedAt: -1, versionNumber: -1 }).select('_id versionNumber'),
    DeploymentVersion.findOne({ deploymentRef: siteId, state: VERSION_STATE.READY }).sort({ vercelCreatedAt: -1, versionNumber: -1 }).select('_id versionNumber'),
    DeploymentVersion.findOne({ deploymentRef: siteId, isCurrentProduction: true }).select('_id versionNumber'),
  ]);
  return {
    latestVersionId: latest?._id || null,
    latestVersionNumber: latest?.versionNumber || null,
    latestSuccessfulVersionId: latestSuccessful?._id || null,
    currentProductionVersionId: currentProduction?._id || null,
    currentProductionVersionNumber: currentProduction?.versionNumber || null,
  };
};

/** Public shape of a version, including its role. */
const serializeVersion = (v, summary = {}) => {
  const id = String(v._id);
  const isLatest = summary.latestVersionId && String(summary.latestVersionId) === id;
  const isLatestSuccessful = summary.latestSuccessfulVersionId && String(summary.latestSuccessfulVersionId) === id;
  const role = v.isCurrentProduction ? 'current-production' : isLatest ? 'latest' : isLatestSuccessful ? 'latest-successful' : 'historical';
  return {
    id,
    versionNumber: v.versionNumber,
    label: `v${v.versionNumber}`,
    vercelDeploymentId: v.vercelDeploymentId,
    url: v.url,
    environment: v.environment,
    state: v.state,
    readySubstate: v.readySubstate,
    commitSha: v.commitSha,
    commitShortSha: v.commitSha ? String(v.commitSha).slice(0, 7) : null,
    commitMessage: v.commitMessage,
    commitRef: v.commitRef,
    isCurrentProduction: Boolean(v.isCurrentProduction),
    isLatest: Boolean(isLatest),
    isLatestSuccessful: Boolean(isLatestSuccessful),
    role,
    origin: v.origin,
    availability: v.availability,
    createdAt: v.vercelCreatedAt,
    buildingAt: v.buildingAt,
    readyAt: v.readyAt,
    durationMs: v.durationMs,
    errorCode: v.errorCode,
    errorMessage: v.errorMessage,
    lastProductionAt: v.lastProductionAt,
  };
};

/** Keyset-paginated history, newest version first. Cursor = last versionNumber returned. */
const listVersions = async (site, { limit = 20, cursor, environment, state } = {}) => {
  const filter = { deploymentRef: site._id, userId: site.userId };
  if (environment) filter.environment = environment;
  if (state) filter.state = state;
  const cursorNumber = Number.parseInt(cursor, 10);
  if (Number.isFinite(cursorNumber)) filter.versionNumber = { $lt: cursorNumber };

  const take = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
  const rows = await DeploymentVersion.find(filter).sort({ versionNumber: -1 }).limit(take + 1);
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return { versions: page, nextCursor: hasMore ? String(page[page.length - 1].versionNumber) : null };
};

module.exports = {
  syncSite,
  reconcileProjectDeployment,
  setCurrentProduction,
  withOptionalTransaction,
  getSummary,
  listVersions,
  serializeVersion,
  config,
};
