'use strict';

const WhatsAppNotification = require('./whatsappNotification.model');
const settings = require('./settings.service');
const { getWhatsAppConfig } = require('./config');
const { enqueueJob } = require('../queue/queues');
const { QUEUE_NAMES, JOB_TYPES, PRIORITY } = require('../queue/names');

// Producer side of the WhatsApp admin notifications (events-queue). Business code calls these and moves on:
//  - they never throw (a notification problem must never fail a purchase, webhook or payout),
//  - they never call WhatsApp (the worker does),
//  - they carry record ids only; the worker re-reads current state and re-verifies it before sending,
//  - the eventKey is derived from the business record, so webhook retries / refreshes / replays collapse
//    into ONE logical notification, even across restarts (it is enforced by a unique index, not by memory).

const id = (v) => (v && v._id ? String(v._id) : String(v));

/**
 * Create-or-get the delivery record, then hand it to BullMQ through the existing durable outbox.
 * Calling this again for the same eventKey is always safe.
 */
const enqueueNotification = async ({ type, category, purpose = 'event', eventKey, refType, refId, context, requestedBy }) => {
  const gate = await settings.evaluate(category, { purpose });
  if (!gate.allowed) return { enqueued: false, skipped: true, reason: gate.reason };

  const cfg = getWhatsAppConfig();
  let record;
  try {
    record = await WhatsAppNotification.create({
      eventKey,
      type,
      category,
      refType,
      refId: refId ? String(refId) : undefined,
      context,
      requestedBy,
      recipientMasked: cfg.recipientMasked || undefined,
      expiresAt: new Date(Date.now() + cfg.historyDays * 24 * 3600 * 1000),
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    record = await WhatsAppNotification.findOne({ eventKey }).select('_id status eventKey manualRetries');
  }

  const queueJobKey = `wa-${eventKey}`;
  const job = await enqueueJob({
    queue: QUEUE_NAMES.EVENTS,
    type,
    jobKey: queueJobKey,
    data: { notificationId: String(record._id) },
    refType: 'whatsapp',
    refId: String(record._id),
    priority: PRIORITY.NOTIFICATION,
    attempts: cfg.attempts,
    durable: true, // intent is stored in MongoDB first; the outbox sweeper republishes if Redis is down
  });
  if (!job.duplicate) await WhatsAppNotification.updateOne({ _id: record._id }, { $set: { queueJobKey } }).catch(() => {});
  return { enqueued: !job.duplicate, duplicate: Boolean(job.duplicate), notificationId: String(record._id), queued: job.accepted !== false };
};

const safely = (label, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(`[whatsapp] could not enqueue ${label}: ${error?.code || error?.message}`);
    return { enqueued: false, error: true };
  }
};

/**
 * Subscription payment confirmed AND entitlement applied (BillingOrder.status === 'paid' && appliedAt set).
 * "new" and "upgrade" orders -> SUBSCRIPTION_PURCHASED, "renewal" orders -> SUBSCRIPTION_RENEWED.
 * Keyed by the order, so the webhook, the verify endpoint, the status poller and a page refresh all converge.
 */
const notifySubscriptionPaid = safely('subscription notification', async (order) => {
  if (!order || order.status !== 'paid' || !order.appliedAt) return { enqueued: false, skipped: true, reason: 'not_confirmed' };
  if (order.failureReason === 'superseded_by_higher_plan') return { enqueued: false, skipped: true, reason: 'not_applied' };
  const renewal = order.kind === 'renewal';
  return enqueueNotification({
    type: renewal ? JOB_TYPES.SUBSCRIPTION_RENEWED : JOB_TYPES.SUBSCRIPTION_PURCHASED,
    category: renewal ? 'renewal' : 'subscription',
    eventKey: `sub-paid-${id(order)}`,
    refType: 'billing_order',
    refId: id(order),
    context: { orderId: id(order) },
  });
});

/**
 * Website purchase reached DevDrop's authoritative success state: a Purchase with paymentStatus "completed"
 * (created only after Razorpay verification, a fully-discounted coupon order, or a free claim).
 * Free claims are not alerted unless WHATSAPP_NOTIFY_FREE_CLAIMS=true.
 */
const notifyWebsitePurchased = safely('website purchase notification', async (purchase) => {
  if (!purchase || purchase.paymentStatus !== 'completed') return { enqueued: false, skipped: true, reason: 'not_completed' };
  if (!getWhatsAppConfig().notifyFreeClaims && !(Number(purchase.totalPaid) > 0) && purchase.category === 'free') {
    return { enqueued: false, skipped: true, reason: 'free_claim' };
  }
  return enqueueNotification({
    type: JOB_TYPES.WEBSITE_PURCHASED,
    category: 'websitePurchase',
    eventKey: `web-purchase-${id(purchase)}`,
    refType: 'purchase',
    refId: id(purchase),
    context: { purchaseId: id(purchase) },
  });
});

module.exports = { enqueueNotification, notifySubscriptionPaid, notifyWebsitePurchased };
