'use strict';

const crypto = require('crypto');
const WhatsAppNotification = require('./whatsappNotification.model');
const settings = require('./settings.service');
const { getWhatsAppConfig } = require('./config');
const { enqueueNotification } = require('./notificationEvents');
const { enqueueJob } = require('../queue/queues');
const { QUEUE_NAMES, JOB_TYPES, PRIORITY } = require('../queue/names');

// Admin-facing operations behind /api/admin/whatsapp. Controllers stay thin; all rules live here.

const RETRYABLE_STATUSES = ['failed', 'unconfirmed'];
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16);

// Public shape of a history row: no message body, no recipient number, no customer e-mail/name.
const toPublic = (n) => ({
  id: String(n._id),
  type: n.type,
  category: n.category,
  status: n.status,
  summary: n.summary || null,
  refType: n.refType || null,
  refId: n.refId || null,
  attempts: n.attempts || 0,
  ambiguousAttempts: n.ambiguousAttempts || 0,
  manualRetries: n.manualRetries || 0,
  recipient: n.recipientMasked || null,
  createdAt: n.createdAt,
  lastAttemptAt: n.lastAttemptAt || null,
  sentAt: n.sentAt || null,
  providerMessageId: n.providerMessageId || null,
  skippedReason: n.skippedReason || null,
  failure: n.failure && (n.failure.code || n.failure.message) ? { code: n.failure.code, message: n.failure.message, ambiguous: Boolean(n.failure.ambiguous) } : null,
  canRetry: RETRYABLE_STATUSES.includes(n.status),
  retryMayDuplicate: n.status === 'unconfirmed',
});

const listNotifications = async ({ status, type, page = 1, limit = 20 } = {}) => {
  const filter = {};
  const statuses = String(status || '').split(',').map((s) => s.trim()).filter((s) => WhatsAppNotification.STATUSES.includes(s));
  if (statuses.length) filter.status = { $in: statuses };
  if (type && WhatsAppNotification.TYPES.includes(type)) filter.type = type;

  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const [rows, total, counts] = await Promise.all([
    WhatsAppNotification.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    WhatsAppNotification.countDocuments(filter),
    WhatsAppNotification.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  return {
    notifications: rows.map(toPublic),
    counts: Object.fromEntries(WhatsAppNotification.STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n || 0])),
    pagination: { page: p, limit: l, total, pages: Math.max(1, Math.ceil(total / l)) },
  };
};

class AdminOpError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const assertAllowed = async (category, purpose) => {
  const gate = await settings.evaluate(category, { purpose });
  if (!gate.allowed) throw new AdminOpError(settings.REASON_TEXT[gate.reason], 409, gate.reason.toUpperCase());
};

/** Re-queues a failed / unconfirmed notification under a fresh queue job key (BullMQ ignores re-used job ids). */
const retryNotification = async (id) => {
  if (!/^[a-f\d]{24}$/i.test(String(id))) throw new AdminOpError('Notification not found.', 404, 'NOT_FOUND');
  const current = await WhatsAppNotification.findById(id).select('status category type');
  if (!current) throw new AdminOpError('Notification not found.', 404, 'NOT_FOUND');
  if (!RETRYABLE_STATUSES.includes(current.status)) throw new AdminOpError(`A ${current.status} notification cannot be retried.`, 409, 'NOT_RETRYABLE');
  await assertAllowed(current.category, current.type === JOB_TYPES.WHATSAPP_TEST ? 'test' : current.type === JOB_TYPES.ADMIN_REPORT ? 'report' : 'event');

  // Atomic claim: two admins clicking Retry cannot both re-queue it.
  const n = await WhatsAppNotification.findOneAndUpdate(
    { _id: id, status: { $in: RETRYABLE_STATUSES } },
    { $set: { status: 'pending', ambiguousAttempts: 0 }, $unset: { failure: '', skippedReason: '' }, $inc: { manualRetries: 1 } },
    { new: true }
  );
  if (!n) throw new AdminOpError('This notification was already retried.', 409, 'NOT_RETRYABLE');

  const cfg = getWhatsAppConfig();
  const queueJobKey = `wa-${n.eventKey}-r${n.manualRetries}`;
  await enqueueJob({
    queue: QUEUE_NAMES.EVENTS,
    type: n.type,
    jobKey: queueJobKey,
    data: { notificationId: String(n._id) },
    refType: 'whatsapp',
    refId: String(n._id),
    priority: PRIORITY.NOTIFICATION,
    attempts: cfg.attempts,
    durable: true,
  });
  await WhatsAppNotification.updateOne({ _id: n._id }, { $set: { queueJobKey } });
  return { id: String(n._id), status: 'pending' };
};

const sendTest = async (adminId) =>
  (await assertAllowed('test', 'test'), enqueueNotification({
    type: JOB_TYPES.WHATSAPP_TEST,
    category: 'test',
    purpose: 'test',
    // one test per admin per 10 seconds: a double click does not send two messages
    eventKey: `test-${adminId}-${Math.floor(Date.now() / 10000)}`,
    refType: 'user',
    refId: String(adminId),
    context: {},
    requestedBy: adminId,
  }));

/** Queues an already-rendered report. `fingerprint` makes the same preview/selection idempotent. */
const sendReport = async ({ adminId, metrics, message, fingerprint }) => {
  await assertAllowed('adminReport', 'report');
  return enqueueNotification({
    type: JOB_TYPES.ADMIN_REPORT,
    category: 'adminReport',
    purpose: 'report',
    eventKey: `report-${adminId}-${fingerprint || `${sha(metrics.join(','))}-${Math.floor(Date.now() / 10000)}`}`,
    refType: 'report',
    refId: undefined,
    context: { message, metrics },
    requestedBy: adminId,
  });
};

module.exports = { listNotifications, retryNotification, sendTest, sendReport, toPublic, AdminOpError, RETRYABLE_STATUSES };
