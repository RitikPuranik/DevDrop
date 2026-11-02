'use strict';

/**
 * Entitlements + quota accounting. This is THE gate in front of ai-service.
 *
 * Quota accounting policy (documented, enforced here):
 *  - A unit is RESERVED atomically before a job is enqueued. No reservation => no job => no ai-service call.
 *  - Internal retries / quota delays / BullMQ attempts reuse the same jobKey and never reserve again.
 *  - A job that COMPLETES is committed (the unit stays consumed).
 *  - A job that FAILS, or is cancelled before it started, is released (the unit is refunded).
 *    A job cancelled after it started stays consumed (provider tokens were spent).
 *  - Debug-retry of a failed job re-takes the unit the failure released (still ONE unit per generation).
 *  - Free: resets on the 1st of every calendar month (India time). Paid: calendar-month windows from the subscription anchor,
 *    for monthly AND yearly billing (yearly is charged upfront but its quota still resets monthly).
 *  - "Unlimited" paid edits are subject to a configurable fair-use ceiling per rolling hour.
 */
const { Subscription, UsageCounter, GenerationLedger } = require('./models');
const { BillingError } = require('./errors');
const { getPlans, getBillingSettings, ENTITLEMENTS } = require('./plans.config');

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Free plan window: the calendar month in India time (IST). Resets at 00:00 IST on the 1st. */
function freeWindow(now) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS);
  return { key: `free:${y}-${String(m + 1).padStart(2, '0')}`, start, end };
}
const STALE_RESERVATION_MS = 15 * 60 * 1000;

// ---------- date helpers (UTC, calendar months, day-of-month clamped) ----------
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** The quota window containing `now`, anchored at `anchor`. Windows are [anchor + k months, anchor + (k+1) months). */
function quotaWindow(anchor, now) {
  let k = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (k < 0) k = 0;
  while (k > 0 && addMonths(anchor, k) > now) k -= 1;
  while (addMonths(anchor, k + 1) <= now) k += 1;
  return { start: addMonths(anchor, k), end: addMonths(anchor, k + 1) };
}

// ---------- entitlement resolution ----------
/**
 * Resolves what the user is entitled to RIGHT NOW from authoritative server state.
 * Also performs the lazy active -> expired transition (idempotent conditional write).
 */
async function resolveEntitlement(userId, now = new Date()) {
  const plans = getPlans();
  const settings = getBillingSettings();
  let sub = await Subscription.findOne({ userId });
  let lapsed = null;

  if (sub && sub.status === 'active') {
    const graceEnd = new Date(sub.currentPeriodEnd.getTime() + settings.graceDays * DAY_MS);
    if (now >= graceEnd) {
      const endReason = sub.cancelAtPeriodEnd ? 'cancelled' : 'expired';
      await Subscription.updateOne({ _id: sub._id, status: 'active', currentPeriodEnd: { $lte: new Date(now.getTime() - settings.graceDays * DAY_MS) } }, { $set: { status: 'expired', endReason } });
      sub.status = 'expired';
      sub.endReason = endReason;
    }
  }

  let status = 'free';
  let plan = plans.free;
  let window = freeWindow(now);

  if (sub && sub.status === 'active' && plans[sub.planId]?.available) {
    plan = plans[sub.planId];
    const inGrace = now >= sub.currentPeriodEnd;
    status = inGrace ? 'grace' : (sub.cancelAtPeriodEnd ? 'cancelling' : 'active');
    const w = quotaWindow(sub.quotaAnchor, now);
    window = { key: w.start.toISOString(), start: w.start, end: w.end };
  } else if (sub) {
    lapsed = { endedAt: sub.currentPeriodEnd, reason: sub.endReason || 'expired', planId: sub.planId };
    status = 'expired';
  }

  return { userId, plans, settings, plan, status, subscription: sub || null, window, lapsed, now };
}

const upgradeOptionsFor = (ent) => Object.values(ent.plans)
  .filter((p) => p.available && p.purchasable && p.rank > ent.plan.rank)
  .map((p) => ({ planId: p.id, name: p.name, monthlyPriceMinor: p.monthlyPriceMinor, currency: p.currency, generationQuota: p.generationQuota }));

async function getCounter(userId, windowKey) {
  return (await UsageCounter.findOne({ userId, windowKey })) || { generationsUsed: 0, editsUsed: 0 };
}

function quotaError(ent, kind, used, limit) {
  const isEdit = kind === 'edit';
  const options = upgradeOptionsFor(ent);
  const details = {
    kind,
    currentPlan: { id: ent.plan.id, name: ent.plan.name },
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: ent.window.end ? ent.window.end.toISOString() : null,
    quotaPeriod: ent.plan.quotaPeriod,
    upgradeOptions: options,
    isTopPlan: options.length === 0,
    subscriptionStatus: ent.status,
  };
  if (ent.status === 'expired' && ent.lapsed) {
    return new BillingError('SUBSCRIPTION_INACTIVE', 'Your subscription has ended. Renew it to keep building with DevDrop AI.', { ...details, lapsedAt: ent.lapsed.endedAt?.toISOString?.() || null, lapsedPlanId: ent.lapsed.planId });
  }
  return new BillingError(
    isEdit ? 'EDIT_QUOTA_EXCEEDED' : 'GENERATION_QUOTA_EXCEEDED',
    isEdit ? 'You’ve used all your AI edits for this plan.' : 'You’ve reached your generation limit for this billing period.',
    details
  );
}

function upgradeRequiredError(ent) {
  return new BillingError('PLAN_UPGRADE_REQUIRED', 'Choose a plan to start building websites with DevDrop AI.', {
    currentPlan: { id: ent.plan.id, name: ent.plan.name },
    upgradeOptions: upgradeOptionsFor(ent),
    subscriptionStatus: ent.status,
  });
}

function limitFor(ent, kind) {
  if (kind === 'generate') return { field: 'generationsUsed', limit: ent.plan.generationQuota };
  return ent.plan.aiEdits.unlimited ? { field: 'editsUsed', limit: null } : { field: 'editsUsed', limit: ent.plan.aiEdits.limit };
}

async function fairUseCheck(ent) {
  if (!ent.plan.aiEdits.unlimited) return;
  const since = new Date(ent.now.getTime() - 60 * 60 * 1000);
  const recent = await GenerationLedger.countDocuments({ userId: ent.userId, kind: 'edit', status: { $ne: 'released' }, createdAt: { $gte: since } });
  if (recent >= ent.settings.fairUseEditsPerHour) {
    throw new BillingError('FAIR_USE_LIMIT_REACHED', 'You’re editing very quickly. Please wait a little while before sending more edits (fair-use limit).', {
      currentPlan: { id: ent.plan.id, name: ent.plan.name },
      fairUsePerHour: ent.settings.fairUseEditsPerHour,
    });
  }
}

/** Read-only pre-flight: same rules as reserve(), no side effects. Used to reject BEFORE any expensive request prep. */
async function checkAccess(userId, kind) {
  const ent = await resolveEntitlement(userId);
  if (kind === 'generate' && ent.plan.generationQuota <= 0) throw upgradeRequiredError(ent);
  const { field, limit } = limitFor(ent, kind);
  if (limit === null) { await fairUseCheck(ent); return ent; }
  const counter = await getCounter(userId, ent.window.key);
  if ((counter[field] || 0) >= limit) throw quotaError(ent, kind, counter[field] || 0, limit);
  return ent;
}

// ---------- atomic counter primitives ----------
async function ensureCounter(userId, windowKey) {
  try {
    await UsageCounter.updateOne({ userId, windowKey }, { $setOnInsert: { generationsUsed: 0, editsUsed: 0 } }, { upsert: true });
  } catch (error) {
    if (error?.code !== 11000) throw error; // lost the creation race: the counter exists, which is all we need
  }
}

/** The one place quota is consumed: a conditional $inc that only matches while under the limit. */
async function takeUnit(userId, windowKey, field, limit) {
  await ensureCounter(userId, windowKey);
  const updated = await UsageCounter.findOneAndUpdate({ userId, windowKey, [field]: { $lt: limit } }, { $inc: { [field]: 1 } }, { new: true });
  return updated ? updated[field] : null;
}

async function giveUnit(userId, windowKey, field) {
  await UsageCounter.updateOne({ userId, windowKey, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } });
}

// ---------- reservation lifecycle ----------
/**
 * Reserve quota for one job. Idempotent per jobKey. Throws BillingError when the user may not dispatch.
 * Returns { ledger, duplicate }.
 */
async function reserveJob({ userId, jobKey, kind, projectId }) {
  const existing = await GenerationLedger.findOne({ jobKey });
  if (existing) {
    if (String(existing.userId) !== String(userId)) throw new BillingError('PLAN_NOT_AVAILABLE', 'This request cannot be processed.');
    return { ledger: existing, duplicate: true };
  }

  await reconcileUserReservations(userId);
  const ent = await resolveEntitlement(userId);
  if (kind === 'generate' && ent.plan.generationQuota <= 0) throw upgradeRequiredError(ent);

  const { field, limit } = limitFor(ent, kind);
  let counted = false;
  if (limit === null) {
    await fairUseCheck(ent);
  } else {
    const used = await takeUnit(userId, ent.window.key, field, limit);
    if (used === null) {
      const counter = await getCounter(userId, ent.window.key);
      throw quotaError(ent, kind, counter[field] || 0, limit);
    }
    counted = true;
  }

  try {
    const ledger = await GenerationLedger.create({ userId, jobKey, projectId: projectId ? String(projectId) : undefined, kind, planId: ent.plan.id, windowKey: ent.window.key, counted, status: 'reserved' });
    return { ledger, duplicate: false };
  } catch (error) {
    if (counted) await giveUnit(userId, ent.window.key, field);
    if (error?.code === 11000) return { ledger: await GenerationLedger.findOne({ jobKey }), duplicate: true };
    throw error;
  }
}

/** Debug-retry of a failed job: still one unit per generation. Entitlement is re-checked; the failed job's released unit is re-taken. */
async function reserveDebugRetry({ userId, originalJobKey, debugJobKey, projectId }) {
  const ent = await resolveEntitlement(userId);
  if (ent.plan.generationQuota <= 0) throw upgradeRequiredError(ent);

  const original = await GenerationLedger.findOne({ jobKey: originalJobKey, userId });
  if (!original) return reserveJob({ userId, jobKey: debugJobKey, kind: 'generate', projectId });

  if (original.status === 'released') {
    const { field, limit } = limitFor(ent, original.kind);
    let windowKey = ent.window.key;
    let counted = false;
    if (limit !== null) {
      const used = await takeUnit(userId, windowKey, field, limit);
      if (used === null) {
        const counter = await getCounter(userId, windowKey);
        throw quotaError(ent, original.kind, counter[field] || 0, limit);
      }
      counted = true;
    }
    const rekeyed = await GenerationLedger.findOneAndUpdate(
      { _id: original._id, status: 'released' },
      { $set: { jobKey: debugJobKey, status: 'reserved', releasedReason: null, windowKey, counted, planId: ent.plan.id } },
      { new: true }
    );
    if (!rekeyed) { // someone else already re-took it
      if (counted) await giveUnit(userId, windowKey, field);
      throw new BillingError('PLAN_NOT_AVAILABLE', 'This retry has already been started.');
    }
    return { ledger: rekeyed, duplicate: false };
  }
  // Reserved/committed rows are already paid for: re-key without a new charge.
  const rekeyed = await GenerationLedger.findOneAndUpdate({ _id: original._id, status: { $in: ['reserved', 'committed'] } }, { $set: { jobKey: debugJobKey, status: 'reserved' } }, { new: true });
  return { ledger: rekeyed || original, duplicate: false };
}

/** completed -> keep the unit. Idempotent. */
async function commitJob(jobKey) {
  if (!jobKey) return false;
  const row = await GenerationLedger.findOneAndUpdate({ jobKey, status: 'reserved' }, { $set: { status: 'committed' } });
  return Boolean(row);
}

/** failed / cancelled-before-start / lost -> refund the unit. Idempotent: only the reserved -> released edge refunds. */
async function releaseJob(jobKey, reason = 'failed') {
  if (!jobKey) return false;
  const row = await GenerationLedger.findOneAndUpdate({ jobKey, status: 'reserved' }, { $set: { status: 'released', releasedReason: reason } });
  if (!row) return false;
  if (row.counted) await giveUnit(row.userId, row.windowKey, row.kind === 'generate' ? 'generationsUsed' : 'editsUsed');
  return true;
}

/** A job may only be served to ai-service if it holds a live reservation. */
async function isJobAuthorized(jobKey) {
  const row = await GenerationLedger.findOne({ jobKey });
  return Boolean(row && (row.status === 'reserved' || row.status === 'committed'));
}

/**
 * Self-healing: reservations whose job is gone/terminal (worker crash, lost webhook) are settled so a user
 * is never permanently locked out by a unit that no job will ever use.
 */
async function reconcileUserReservations(userId) {
  const QueueJob = require('../../infrastructure/queue/queueJob.model');
  const cutoff = new Date(Date.now() - STALE_RESERVATION_MS);
  const stale = await GenerationLedger.find({ userId, status: 'reserved', createdAt: { $lte: cutoff } });
  for (const row of stale || []) {
    const job = await QueueJob.findOne({ jobKey: row.jobKey });
    if (!job || job.status === 'failed') await releaseJob(row.jobKey, 'lost');
    else if (job.status === 'completed') await commitJob(row.jobKey);
    else if (job.status === 'cancelled') await commitJob(row.jobKey); // cancelled after start keeps the unit
  }
}

/**
 * Decide server-side whether a request is an "edit" or a "generation". The client's claim is never trusted:
 * an edit needs a project this user owns that already has a COMMITTED generation (or a pre-billing legacy project).
 */
async function classifyRequest({ userId, projectId, claimsEdit, project }) {
  if (!claimsEdit || !projectId) return 'generate';
  const committed = await GenerationLedger.exists({ userId, projectId: String(projectId), kind: 'generate', status: 'committed' });
  if (committed) return 'edit';
  const cutoff = getBillingSettings().legacyProjectsBefore;
  const hasFiles = project?.files && Object.keys(project.files).length > 0;
  if (cutoff && project?.createdAt && new Date(project.createdAt) < cutoff && hasFiles) return 'edit';
  return 'generate';
}


// ---------- feature entitlements ----------
const PAID_STATUSES = ['active', 'cancelling', 'grace'];

/** True only when the user's CURRENT, server-resolved plan holds the entitlement (never a client claim). */
function hasEntitlement(ent, name) {
  return Boolean(ent && PAID_STATUSES.includes(ent.status) && Array.isArray(ent.plan?.entitlements) && ent.plan.entitlements.includes(name));
}

/** Operational kill-switch: ADVANCED_GENERATION_ENABLED=false routes everyone to the existing pipeline without touching plans. */
const advancedGenerationEnabled = (env = process.env) => !/^(0|false|no|off)$/i.test(String(env.ADVANCED_GENERATION_ENABLED ?? 'true'));

function featureNotInPlanError(ent, feature) {
  return new BillingError('FEATURE_NOT_IN_PLAN', 'Advanced website generation is available on the Pro and Plus plans.', {
    feature,
    currentPlan: { id: ent.plan.id, name: ent.plan.name },
    upgradeOptions: upgradeOptionsFor(ent).filter((o) => ent.plans[o.planId]?.entitlements?.includes(feature)),
    subscriptionStatus: ent.status,
  });
}

/**
 * Decides, from server state only, which generation pipeline a request runs on.
 *   requested === 'advanced' by a user without the entitlement  -> FEATURE_NOT_IN_PLAN (nothing is queued, nothing is charged)
 *   entitled + a new generation (not an edit)                    -> 'advanced', with this plan's resource budget
 *   everyone else                                                -> 'standard' (the existing pipeline, unchanged)
 * Call it BEFORE any expensive request preparation.
 */
function resolveGenerationTier({ ent, requested, usageKind = 'generate', env = process.env }) {
  const feature = ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION;
  const entitled = hasEntitlement(ent, feature);
  if (requested === 'advanced' && !entitled) throw featureNotInPlanError(ent, feature);
  const optedDown = requested === 'standard';
  if (entitled && usageKind === 'generate' && !optedDown && advancedGenerationEnabled(env)) {
    return { tier: 'advanced', entitled, limits: ent.plan.advancedLimits || null };
  }
  return { tier: 'standard', entitled, limits: null };
}

// ---------- read models for the API ----------
async function getUsageSummary(userId) {
  await reconcileUserReservations(userId);
  const ent = await resolveEntitlement(userId);
  const counter = await getCounter(userId, ent.window.key);
  const genLimit = ent.plan.generationQuota;
  const editLimit = ent.plan.aiEdits.unlimited ? null : ent.plan.aiEdits.limit;
  const sub = ent.subscription;
  return {
    plan: { id: ent.plan.id, name: ent.plan.name },
    subscriptionStatus: ent.status,
    billingInterval: ent.status === 'free' || ent.status === 'expired' ? null : sub.interval,
    renewalDate: ent.status === 'active' || ent.status === 'cancelling' || ent.status === 'grace' ? sub.currentPeriodEnd.toISOString() : null,
    quotaPeriod: ent.plan.quotaPeriod,
    nextQuotaReset: ent.window.end ? ent.window.end.toISOString() : null,
    windowStart: ent.window.start ? ent.window.start.toISOString() : null,
    generations: { used: counter.generationsUsed || 0, limit: genLimit, remaining: Math.max(0, genLimit - (counter.generationsUsed || 0)) },
    edits: ent.plan.aiEdits.unlimited
      ? { unlimited: true, used: counter.editsUsed || 0, limit: null, remaining: null, fairUsePerHour: ent.settings.fairUseEditsPerHour }
      : { unlimited: false, used: counter.editsUsed || 0, limit: editLimit, remaining: Math.max(0, editLimit - (counter.editsUsed || 0)) },
    upgradeOptions: upgradeOptionsFor(ent),
    isTopPlan: upgradeOptionsFor(ent).length === 0,
    // Display only: the browser uses this to decide what to SHOW. The backend re-decides on every request.
    entitlements: [...(ent.plan.entitlements || [])].filter(() => PAID_STATUSES.includes(ent.status)),
    features: { advancedWebsiteGeneration: hasEntitlement(ent, ENTITLEMENTS.ADVANCED_WEBSITE_GENERATION) && advancedGenerationEnabled() },
  };
}

module.exports = {
  addMonths, quotaWindow, resolveEntitlement, checkAccess, reserveJob, reserveDebugRetry, commitJob, releaseJob,
  isJobAuthorized, reconcileUserReservations, classifyRequest, getUsageSummary, upgradeOptionsFor, freeWindow, DAY_MS,
  hasEntitlement, resolveGenerationTier, advancedGenerationEnabled, ENTITLEMENTS,
};
