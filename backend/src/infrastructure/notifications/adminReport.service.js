'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Website = require('../../modules/website/website.model');
const Payout = require('../../modules/payout/payout.model');
const Purchase = require('../../modules/payment/purchase.model');
const { Subscription, BillingOrder } = require('../../modules/billing/models');
const { getPlans, getBillingSettings } = require('../../modules/billing/plans.config');
const { WEBSITE_STATUS, PAYOUT_STATUS, PAYMENT_STATUS } = require('../../shared/utils/constants');
const { METRICS, METRIC_ORDER, renderReport } = require('./messageTemplates');

const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_TTL = '10m';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Every statistic is ONE indexed count or ONE aggregation executed by MongoDB; nothing is loaded into memory.
 * Definitions mirror the existing admin panel / billing logic rather than inventing new states.
 */
const collectors = {
  // Admin "Review Queue": status pending_review on a non-deleted listing.
  [METRICS.PENDING_VERIFICATIONS]: async () => ({
    count: await Website.countDocuments({ status: WEBSITE_STATUS.PENDING_REVIEW, isDeleted: false }),
  }),

  // Admin "Payouts": only status "pending". processing / completed / failed / cancelled are excluded.
  [METRICS.PENDING_PAYOUTS]: async () => {
    const [row] = await Payout.aggregate([
      { $match: { status: PAYOUT_STATUS.PENDING } },
      { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
    ]);
    return { count: row?.count || 0, totalAmount: round2(row?.totalAmount) };
  },

  // Entitled right now = stored status "active" and not past term end + grace (same rule as resolveEntitlement).
  // Historical purchases are finalized paid orders, reported separately so they are never confused with active subs.
  [METRICS.SUBSCRIPTIONS]: async (now) => {
    const graceMs = getBillingSettings().graceDays * DAY_MS;
    const [rows, historicalPurchases] = await Promise.all([
      Subscription.aggregate([
        { $match: { status: 'active', currentPeriodEnd: { $gt: new Date(now.getTime() - graceMs) } } },
        { $group: { _id: '$planId', count: { $sum: 1 }, cancelling: { $sum: { $cond: ['$cancelAtPeriodEnd', 1, 0] } } } },
      ]),
      BillingOrder.countDocuments({ status: 'paid', appliedAt: { $ne: null } }),
    ]);
    const plans = getPlans();
    const byPlan = Object.keys(plans)
      .filter((id) => plans[id].purchasable)
      .map((id) => ({ planId: id, name: plans[id].name, count: rows.find((r) => r._id === id)?.count || 0 }));
    // Any plan id that exists in data but not in the catalogue is still counted, never silently dropped.
    rows.filter((r) => !byPlan.some((p) => p.planId === r._id)).forEach((r) => byPlan.push({ planId: r._id, name: String(r._id), count: r.count }));
    return {
      totalActive: rows.reduce((n, r) => n + r.count, 0),
      cancelling: rows.reduce((n, r) => n + r.cancelling, 0),
      byPlan,
      historicalPurchases,
    };
  },

  // Completed purchases only. (websiteId, buyerId) is unique on Purchase, so a purchase can never count twice.
  [METRICS.BOUGHT_WEBSITES]: async () => {
    const [row] = await Purchase.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: 1 }, paid: { $sum: { $cond: [{ $gt: ['$totalPaid', 0] }, 1, 0] } } } },
    ]);
    const total = row?.total || 0;
    const paid = row?.paid || 0;
    return { total, paid, free: total - paid };
  },
};

const normalizeMetrics = (input) => {
  if (!Array.isArray(input)) return null;
  const unique = [...new Set(input.map(String))];
  if (!unique.length || unique.some((m) => !METRIC_ORDER.includes(m))) return null;
  return METRIC_ORDER.filter((m) => unique.includes(m));
};

/** Runs only the requested collectors, in parallel. */
const getStats = async (metrics = METRIC_ORDER, now = new Date()) => {
  const entries = await Promise.all(metrics.map(async (m) => [m, await collectors[m](now)]));
  return Object.fromEntries(entries);
};

const buildReport = async (metrics, now = new Date()) => {
  const stats = await getStats(metrics, now);
  return { metrics, stats, generatedAt: now.toISOString(), message: renderReport({ metrics, stats, generatedAt: now }) };
};

// ---- preview -> send guarantee: the admin sends exactly the text they previewed.
const previewSecret = () => `${process.env.JWT_SECRET || ''}:whatsapp-report`;

const signPreview = ({ metrics, stats, generatedAt }, adminId) =>
  jwt.sign({ m: metrics, s: stats, g: generatedAt }, previewSecret(), { expiresIn: PREVIEW_TTL, audience: 'whatsapp-report', subject: String(adminId), jwtid: crypto.randomBytes(8).toString('hex') });

/** Returns the snapshot, or null if the token is invalid / expired / belongs to someone else / is for other metrics. */
const readPreview = (token, adminId, metrics) => {
  try {
    const p = jwt.verify(token, previewSecret(), { audience: 'whatsapp-report' });
    if (p.sub !== String(adminId)) return null;
    if (JSON.stringify([...p.m].sort()) !== JSON.stringify([...metrics].sort())) return null;
    return { metrics: normalizeMetrics(p.m), stats: p.s, generatedAt: p.g, previewId: p.jti };
  } catch {
    return null;
  }
};

const messageFromSnapshot = (snap) => renderReport({ metrics: snap.metrics, stats: snap.stats, generatedAt: snap.generatedAt });

module.exports = { collectors, normalizeMetrics, getStats, buildReport, signPreview, readPreview, messageFromSnapshot };
