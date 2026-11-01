'use strict';

const rateLimit = require('express-rate-limit');
const settingsService = require('../../infrastructure/notifications/settings.service');
const reports = require('../../infrastructure/notifications/adminReport.service');
const admin = require('../../infrastructure/notifications/notificationAdmin.service');
const { getWhatsAppConfig } = require('../../infrastructure/notifications/config');
const { METRIC_ORDER, METRICS, renderReport } = require('../../infrastructure/notifications/messageTemplates');
const { QueueUnavailableError } = require('../../infrastructure/queue/queues');

// Every route here is mounted under admin.routes.js, which applies the existing `auth` + `adminOnly` middleware.

const METRIC_INFO = [
  { id: METRICS.PENDING_VERIFICATIONS, label: 'Pending Website Verifications', description: 'Websites awaiting admin review.' },
  { id: METRICS.PENDING_PAYOUTS, label: 'Pending Payouts', description: 'Pending payout requests and the total amount owed.' },
  { id: METRICS.SUBSCRIPTIONS, label: 'Total Subscriptions', description: 'Active paid subscriptions by plan, plus historical purchases.' },
  { id: METRICS.BOUGHT_WEBSITES, label: 'Total Bought Websites', description: 'Completed website purchases only.' },
];

const fail = (res, error, fallback) => {
  if (error instanceof admin.AdminOpError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  if (error instanceof QueueUnavailableError || error?.code === 'QUEUE_UNAVAILABLE') return res.status(503).json({ success: false, code: 'QUEUE_UNAVAILABLE', message: 'The notification queue is temporarily unavailable. Please try again.' });
  console.error(`[whatsapp-admin] ${fallback}: ${error?.message}`);
  return res.status(500).json({ success: false, message: fallback });
};

const publicConfig = () => {
  const cfg = getWhatsAppConfig();
  // Booleans and a masked number only. The token, phone-number id and full number never leave the server.
  return { masterEnabled: cfg.masterEnabled, configured: cfg.configured, recipient: cfg.recipientMasked, graphApiVersion: cfg.graphApiVersion };
};

const getOverview = async (req, res) => {
  try {
    res.json({ success: true, data: { config: publicConfig(), settings: await settingsService.getSettings(), metrics: METRIC_INFO } });
  } catch (error) {
    fail(res, error, 'Could not load WhatsApp settings');
  }
};

const updateSettings = async (req, res) => {
  try {
    const { enabled, categories } = req.body || {};
    if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: '"enabled" must be true or false.' });
    if (categories !== undefined && (typeof categories !== 'object' || categories === null || Array.isArray(categories))) return res.status(400).json({ success: false, message: '"categories" must be an object.' });
    const unknown = Object.keys(categories || {}).filter((k) => !settingsService.CATEGORY_KEYS.includes(k));
    if (unknown.length) return res.status(400).json({ success: false, message: `Unknown categories: ${unknown.join(', ')}` });
    if (Object.values(categories || {}).some((v) => typeof v !== 'boolean')) return res.status(400).json({ success: false, message: 'Category values must be true or false.' });
    res.json({ success: true, data: { settings: await settingsService.updateSettings({ enabled, categories }, req.userId) } });
  } catch (error) {
    fail(res, error, 'Could not update WhatsApp settings');
  }
};

// Live numbers for the selection cards (all four, computed by MongoDB aggregation).
const getReportStats = async (req, res) => {
  try {
    res.json({ success: true, data: { stats: await reports.getStats(METRIC_ORDER), generatedAt: new Date().toISOString() } });
  } catch (error) {
    fail(res, error, 'Could not load report statistics');
  }
};

const parseMetrics = (req, res) => {
  const metrics = reports.normalizeMetrics(req.body?.metrics);
  if (!metrics) {
    res.status(400).json({ success: false, message: `Select at least one metric. Allowed: ${METRIC_ORDER.join(', ')}.` });
    return null;
  }
  return metrics;
};

const previewReport = async (req, res) => {
  try {
    const metrics = parseMetrics(req, res);
    if (!metrics) return;
    const report = await reports.buildReport(metrics);
    res.json({ success: true, data: { message: report.message, stats: report.stats, generatedAt: report.generatedAt, previewToken: reports.signPreview(report, req.userId) } });
  } catch (error) {
    fail(res, error, 'Could not build the report preview');
  }
};

const sendReport = async (req, res) => {
  try {
    const metrics = parseMetrics(req, res);
    if (!metrics) return;
    let message;
    let fingerprint;
    if (req.body?.previewToken) {
      // Send EXACTLY what was previewed.
      const snap = reports.readPreview(String(req.body.previewToken), req.userId, metrics);
      if (!snap) return res.status(400).json({ success: false, code: 'PREVIEW_EXPIRED', message: 'This preview expired or does not match your selection. Preview the report again.' });
      message = reports.messageFromSnapshot(snap);
      fingerprint = snap.previewId; // the same preview can only ever be queued once
    } else {
      message = (await reports.buildReport(metrics)).message;
    }
    const result = await admin.sendReport({ adminId: req.userId, metrics, message, fingerprint });
    res.status(result.duplicate ? 200 : 202).json({ success: true, data: { notificationId: result.notificationId, status: 'queued', duplicate: Boolean(result.duplicate) }, message: result.duplicate ? 'This report was already queued.' : 'Report queued for WhatsApp delivery.' });
  } catch (error) {
    fail(res, error, 'Could not queue the report');
  }
};

const listNotifications = async (req, res) => {
  try {
    res.json({ success: true, data: await admin.listNotifications(req.query) });
  } catch (error) {
    fail(res, error, 'Could not load notification history');
  }
};

const retryNotification = async (req, res) => {
  try {
    res.status(202).json({ success: true, data: await admin.retryNotification(req.params.id), message: 'Notification re-queued.' });
  } catch (error) {
    fail(res, error, 'Could not retry the notification');
  }
};

const sendTest = async (req, res) => {
  try {
    const result = await admin.sendTest(req.userId);
    res.status(result.duplicate ? 200 : 202).json({ success: true, data: { notificationId: result.notificationId, status: 'queued', duplicate: Boolean(result.duplicate) }, message: result.duplicate ? 'A test message was just queued.' : 'Test message queued.' });
  } catch (error) {
    fail(res, error, 'Could not queue the test message');
  }
};

// Sending (reports, tests, retries) is limited per admin so a stuck button cannot flood WhatsApp.
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.WHATSAPP_ADMIN_SEND_LIMIT || '10', 10) || 10,
  keyGenerator: (req) => String(req.userId || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many WhatsApp send requests. Please wait a minute.' },
});

module.exports = { getOverview, updateSettings, getReportStats, previewReport, sendReport, listNotifications, retryNotification, sendTest, sendLimiter, METRIC_INFO, renderReport };
