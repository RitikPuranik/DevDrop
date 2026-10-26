'use strict';

const crypto = require('crypto');
const cryptoUtil = require('../../shared/utils/crypto');
const { enqueueJob } = require('../queue/queues');
const { QUEUE_NAMES, JOB_TYPES, PRIORITY } = require('../queue/names');
const { getQueueConfig } = require('../queue/config');
const QueueJob = require('../queue/queueJob.model');

// Producer side of events-queue. Request handlers call these instead of sending email.
// Payloads carry record IDs (never whole documents) so the worker always reads current state.

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const nonce = () => crypto.randomBytes(8).toString('hex');
const id = (v) => (v && v._id ? String(v._id) : String(v));

const emailBase = { queue: QUEUE_NAMES.EVENTS };

// ---- Security emails (token links). Not outboxed: the token is a secret, so if the queue is
// unreachable we fail the request honestly (503) instead of persisting it for later.
const enqueueVerificationEmail = async (user, token) => {
  const cfg = getQueueConfig();
  return enqueueJob({
    ...emailBase,
    type: JOB_TYPES.EMAIL_VERIFICATION,
    jobKey: `email-verify-${id(user)}-${sha(token).slice(0, 16)}`,
    userId: id(user),
    refType: 'user',
    refId: id(user),
    priority: PRIORITY.SECURITY,
    attempts: cfg.attempts.otp,
    data: { userId: id(user), tokenEnc: cryptoUtil.encrypt(token), notAfter: Date.now() + cfg.securityEmailTtlMs },
  });
};

const enqueuePasswordResetEmail = async (user, token) => {
  const cfg = getQueueConfig();
  return enqueueJob({
    ...emailBase,
    type: JOB_TYPES.EMAIL_PASSWORD_RESET,
    jobKey: `email-reset-${id(user)}-${sha(token).slice(0, 16)}`,
    userId: id(user),
    refType: 'user',
    refId: id(user),
    priority: PRIORITY.SECURITY,
    attempts: cfg.attempts.otp,
    data: { userId: id(user), tokenEnc: cryptoUtil.encrypt(token), notAfter: Date.now() + cfg.securityEmailTtlMs },
  });
};

// True when a verification email for this user was already queued/sent inside the cooldown window.
// Checked BEFORE minting a new token, because a new token invalidates the previous one.
const verificationEmailRecentlyRequested = async (userId) => {
  const { verifyCooldownMs } = getQueueConfig();
  return Boolean(
    await QueueJob.exists({
      type: JOB_TYPES.EMAIL_VERIFICATION,
      userId: id(userId),
      createdAt: { $gt: new Date(Date.now() - verifyCooldownMs) },
      status: { $ne: 'failed' },
    })
  );
};

// ---- Business-event emails: durable (outbox) so a Redis blip never loses them.
const durableEmail = (type, jobKey, data, extra = {}) =>
  enqueueJob({ ...emailBase, type, jobKey, data, durable: true, priority: PRIORITY.TRANSACTIONAL, ...extra });

const enqueueWelcomeEmail = (userId) =>
  durableEmail(JOB_TYPES.EMAIL_WELCOME, `email-welcome-${id(userId)}`, { userId: id(userId) }, { userId: id(userId), refType: 'user', refId: id(userId) });

const enqueuePurchaseConfirmation = (purchaseId, buyerId) =>
  durableEmail(JOB_TYPES.EMAIL_PURCHASE_CONFIRMATION, `email-purchase-${id(purchaseId)}`, { purchaseId: id(purchaseId) }, { userId: buyerId && id(buyerId), refType: 'purchase', refId: id(purchaseId) });

const enqueueSellerNotification = (purchaseId, sellerId) =>
  durableEmail(JOB_TYPES.EMAIL_SELLER_NOTIFICATION, `email-seller-sale-${id(purchaseId)}`, { purchaseId: id(purchaseId) }, { userId: sellerId && id(sellerId), refType: 'purchase', refId: id(purchaseId) });

const enqueueStatusUpdateEmail = ({ sellerId, websiteId, status, comment = '' }) =>
  durableEmail(
    JOB_TYPES.EMAIL_STATUS_UPDATE,
    `email-status-${id(websiteId)}-${status}-${nonce()}`,
    { sellerId: id(sellerId), websiteId: id(websiteId), status, comment: String(comment || '').slice(0, 2000) },
    { userId: id(sellerId), refType: 'website', refId: id(websiteId) }
  );

const enqueuePayoutNotification = (payoutId, sellerId) =>
  durableEmail(JOB_TYPES.EMAIL_PAYOUT_NOTIFICATION, `email-payout-${id(payoutId)}`, { payoutId: id(payoutId) }, { userId: sellerId && id(sellerId), refType: 'payout', refId: id(payoutId) });

const enqueueAdminAlert = ({ subject, message, error, details }) =>
  durableEmail(
    JOB_TYPES.EMAIL_ADMIN_ALERT,
    `email-admin-alert-${nonce()}`,
    { subject: String(subject || '').slice(0, 300), message: String(message || '').slice(0, 2000), error: error ? String(error).slice(0, 1000) : undefined, details: details ? String(details).slice(0, 4000) : undefined },
    { priority: PRIORITY.NOTIFICATION }
  );

// Outbid: enqueue only AFTER the bid + auction writes are committed. jobKey is per accepted bid,
// so a retried request/job can never produce a second email for the same bid.
const enqueueOutbidNotification = ({ bidId, websiteId, previousBidderId, bidAmount }) =>
  durableEmail(
    JOB_TYPES.EMAIL_OUTBID,
    `email-outbid-${id(bidId)}`,
    { bidId: id(bidId), websiteId: id(websiteId), previousBidderId: id(previousBidderId), bidAmount },
    { userId: id(previousBidderId), refType: 'bid', refId: id(bidId), priority: PRIORITY.TRANSACTIONAL }
  );

module.exports = {
  enqueueVerificationEmail,
  enqueuePasswordResetEmail,
  verificationEmailRecentlyRequested,
  enqueueWelcomeEmail,
  enqueuePurchaseConfirmation,
  enqueueSellerNotification,
  enqueueStatusUpdateEmail,
  enqueuePayoutNotification,
  enqueueAdminAlert,
  enqueueOutbidNotification,
};
