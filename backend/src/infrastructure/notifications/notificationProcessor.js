'use strict';

const WhatsAppNotification = require('./whatsappNotification.model');
const settings = require('./settings.service');
const { getWhatsAppConfig, maskPhone } = require('./config');
const { sendAdminText, WhatsAppSendError, scrub } = require('./whatsappCloud.service');
const { render, formatMoneyMinor, formatMoneyMajor, formatDateTime, UNAVAILABLE } = require('./messageTemplates');
const User = require('../../modules/user/user.model');
const Website = require('../../modules/website/website.model');
const Purchase = require('../../modules/payment/purchase.model');
const Payment = require('../../modules/payment/payment.model');
const { Subscription, BillingOrder } = require('../../modules/billing/models');
const { getPlans } = require('../../modules/billing/plans.config');
const { JOB_TYPES } = require('../queue/names');
const { permanent, FAILURE } = require('../queue/errors');

// Worker side. The delivery record is the source of truth for idempotency:
//
//   pending ──claim──► sending ──API accepted──► sent                       (terminal)
//                         │ definite failure ──► pending (retry) | failed    (failed is retryable by an admin)
//                         │ ambiguous failure ─► pending (retry, capped) | unconfirmed
//                         └ crash / timeout ───► stays "sending"; the next attempt treats it as AMBIGUOUS
//
// "sent" is never re-sent. An ambiguous outcome (request out, no answer) may mean the admin already got the
// message, so automatic re-sends after one are capped (WHATSAPP_MAX_AMBIGUOUS_RETRIES) and then parked as
// "unconfirmed" for a human to decide. Exactly-once is impossible against an API with no idempotency key;
// this bounds the duplicate window to that single ambiguous case.

const outcomeSkipped = (reason) => ({ result: { skipped: true, reason }, delivery: { skippedReason: reason } });

const retryError = (err) => Object.assign(new Error(err.message), { code: err.code, failureClass: FAILURE.TRANSIENT });
const failure = (err) => ({ code: String(err.code || 'WHATSAPP_ERROR').slice(0, 60), message: scrub(err.message), retryable: Boolean(err.retryable), ambiguous: Boolean(err.ambiguous) });

const isFinalAttempt = (job) => (job?.attemptsMade || 0) + 1 >= (job?.opts?.attempts || 1);

const purposeFor = (type) => ({ [JOB_TYPES.ADMIN_REPORT]: 'report', [JOB_TYPES.WHATSAPP_TEST]: 'test' }[type] || 'event');

// ------------------------------------------------------------------ message builders (re-verify business state)

const buildSubscriptionMessage = async (notif) => {
  const order = await BillingOrder.findById(notif.refId);
  if (!order || order.status !== 'paid' || !order.appliedAt) return { skip: 'order_not_confirmed' };
  if (order.failureReason === 'superseded_by_higher_plan') return { skip: 'order_not_applied' };
  const [user, sub] = await Promise.all([User.findById(order.userId).select('name email'), Subscription.findOne({ userId: order.userId }).select('_id')]);
  const plan = getPlans()[order.planId];
  const amountMinor = Number(order.amountMinor);
  const message = render(notif.type, {
    plan_name: plan?.name || order.planId,
    user_name: user?.name,
    user_email: user?.email,
    amount: formatMoneyMinor(amountMinor, order.currency),
    payment_status: amountMinor > 0 ? 'Paid' : 'No payment required',
    subscription_id: sub ? String(sub._id) : undefined,
    date_time: formatDateTime(order.paidAt || order.updatedAt),
  });
  return { message, summary: `${plan?.name || order.planId} · ${formatMoneyMinor(amountMinor, order.currency)}` };
};

const buildWebsiteMessage = async (notif) => {
  const purchase = await Purchase.findById(notif.refId);
  if (!purchase || purchase.paymentStatus !== 'completed') return { skip: 'purchase_not_completed' };
  const [website, buyer, seller, payment] = await Promise.all([
    Website.findById(purchase.websiteId).select('name'),
    User.findById(purchase.buyerId).select('name email'),
    purchase.sellerId ? User.findById(purchase.sellerId).select('name') : null,
    Payment.findOne({ purchaseId: purchase._id }).select('currency'),
  ]);
  const currency = payment?.currency || 'INR';
  const paid = Number(purchase.totalPaid) > 0;
  const message = render(notif.type, {
    website_name: website?.name,
    buyer_name: buyer?.name,
    buyer_email: buyer?.email,
    seller_name: seller?.name || UNAVAILABLE, // seller may be deleted/missing: never fail the alert
    purchase_amount: formatMoneyMajor(purchase.totalPaid, currency),
    payment_status: paid ? 'Paid' : purchase.couponCode ? 'No payment required' : 'Free',
    order_id: purchase.razorpayOrderId || String(purchase._id),
    date_time: formatDateTime(purchase.purchaseDate || purchase.createdAt),
  });
  return { message, summary: `${website?.name || 'Website'} · ${formatMoneyMajor(purchase.totalPaid, currency)}` };
};

const buildMessage = async (notif) => {
  switch (notif.type) {
    case JOB_TYPES.SUBSCRIPTION_PURCHASED:
    case JOB_TYPES.SUBSCRIPTION_RENEWED:
      return buildSubscriptionMessage(notif);
    case JOB_TYPES.WEBSITE_PURCHASED:
      return buildWebsiteMessage(notif);
    case JOB_TYPES.ADMIN_REPORT: // the exact text the admin previewed, stored when it was requested
      return notif.context?.message ? { message: notif.context.message, summary: `Report: ${(notif.context.metrics || []).length} metric(s)` } : { skip: 'report_missing' };
    case JOB_TYPES.WHATSAPP_TEST:
      return { message: render(JOB_TYPES.WHATSAPP_TEST, { date_time: formatDateTime(new Date()) }), summary: 'Test message' };
    default:
      throw permanent(`No WhatsApp handler for ${notif.type}`, 'UNKNOWN_JOB_TYPE');
  }
};

// ------------------------------------------------------------------ processor

const markSkipped = (id, reason) =>
  WhatsAppNotification.updateOne({ _id: id, status: { $ne: 'sent' } }, { $set: { status: 'skipped', skippedReason: reason }, $unset: { failure: '' } });

const processWhatsAppJob = async (job, ctx = {}) => {
  const cfg = getWhatsAppConfig();
  const notificationId = job.data?.notificationId;
  if (!notificationId) throw permanent('Job has no notificationId.', 'BAD_JOB');

  const notif = await WhatsAppNotification.findById(notificationId).select('+context');
  if (!notif) throw permanent('Notification record no longer exists.', 'NOTIFICATION_MISSING');
  if (notif.status === 'sent') return { result: { sent: true, duplicate: true }, delivery: { providerAcceptedAt: notif.sentAt, providerMessageId: notif.providerMessageId } };
  if (notif.status === 'skipped') return outcomeSkipped(notif.skippedReason || 'skipped');

  // Toggles can change while a job waits in the queue: re-check at send time.
  const gate = await settings.evaluate(notif.category, { purpose: purposeFor(notif.type) });
  if (!gate.allowed && gate.reason !== 'not_configured') {
    await markSkipped(notif._id, gate.reason);
    return outcomeSkipped(gate.reason);
  }
  if (!cfg.configured) {
    const err = new WhatsAppSendError('WhatsApp credentials are not configured on the server.', { code: 'WHATSAPP_NOT_CONFIGURED', retryable: false });
    await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'failed', failure: failure(err) } });
    throw permanent(err.message, err.code);
  }

  // Build the message from CURRENT backend state before claiming, so a stale/invalid event never reaches WhatsApp.
  const built = await buildMessage(notif);
  if (built.skip) {
    await markSkipped(notif._id, built.skip);
    return outcomeSkipped(built.skip);
  }

  // Atomic claim. Only one worker can move pending -> sending. A "sending" record is reclaimed only once it is
  // stale (its owner crashed or timed out without recording an outcome); a fresh one belongs to a live attempt.
  const claim = { $set: { status: 'sending', lastAttemptAt: new Date(), summary: built.summary, recipientMasked: maskPhone(cfg.adminPhone) }, $inc: { attempts: 1 } };
  let prior = await WhatsAppNotification.findOneAndUpdate({ _id: notif._id, status: 'pending' }, claim, { new: false });
  if (!prior) {
    const staleBefore = new Date(Date.now() - Math.max(cfg.timeoutMs * 2, 30000));
    prior = await WhatsAppNotification.findOneAndUpdate({ _id: notif._id, status: 'sending', lastAttemptAt: { $lte: staleBefore } }, claim, { new: false });
  }
  if (!prior) {
    const current = await WhatsAppNotification.findById(notif._id).select('status');
    return outcomeSkipped(current?.status === 'sending' ? 'in_flight_elsewhere' : 'already_finalized');
  }

  let ambiguousSoFar = prior.ambiguousAttempts || 0;
  if (prior.status === 'sending') {
    // The previous attempt never recorded its outcome: it may have delivered.
    ambiguousSoFar += 1;
    await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { ambiguousAttempts: ambiguousSoFar } });
    if (ambiguousSoFar > cfg.maxAmbiguousRetries) {
      const err = new WhatsAppSendError('A previous send attempt did not report back; the message may already have been delivered. Not re-sending automatically.', { code: 'WHATSAPP_UNCONFIRMED', retryable: false, ambiguous: true });
      await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'unconfirmed', failure: failure(err) } });
      throw permanent(err.message, err.code);
    }
  }

  try {
    const { messageId } = await sendAdminText(built.message);
    await WhatsAppNotification.updateOne(
      { _id: notif._id },
      { $set: { status: 'sent', sentAt: new Date(), providerMessageId: messageId }, $unset: { failure: '', skippedReason: '' } }
    );
    return { result: { sent: true }, delivery: { providerAcceptedAt: new Date(), providerMessageId: messageId } };
  } catch (error) {
    const err = error instanceof WhatsAppSendError ? error : new WhatsAppSendError(scrub(error?.message), { code: 'WHATSAPP_ERROR', retryable: false });
    const final = isFinalAttempt(job);

    if (err.ambiguous) {
      const count = ambiguousSoFar + 1;
      if (count > cfg.maxAmbiguousRetries || final) {
        await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'unconfirmed', ambiguousAttempts: count, failure: failure(err) } });
        throw permanent(`${err.message}. Delivery could not be confirmed; not retrying automatically.`, err.code);
      }
      await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'pending', ambiguousAttempts: count, failure: failure(err) } });
      throw retryError(err);
    }
    if (err.retryable && !final) {
      await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'pending', failure: failure(err) } });
      throw retryError(err);
    }
    await WhatsAppNotification.updateOne({ _id: notif._id }, { $set: { status: 'failed', failure: failure(err) } });
    throw err.retryable ? Object.assign(new Error(err.message), { code: err.code, failureClass: FAILURE.PERMANENT }) : permanent(err.message, err.code);
  }
};

// Called by the queue wrapper when a job fails for good without the processor having recorded it
// (processor timeout, stalled-job limit, worker crash). Never downgrades a "sent" record.
const onWhatsAppFinalFailure = async (job, error) => {
  const id = job?.data?.notificationId;
  if (!id) return;
  const failed = { code: String(error?.code || 'JOB_FAILED').slice(0, 60), message: scrub(error?.message || 'Job failed'), retryable: true };
  await WhatsAppNotification.updateOne({ _id: id, status: 'sending' }, { $set: { status: 'unconfirmed', failure: { ...failed, ambiguous: true } } });
  await WhatsAppNotification.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'failed', failure: failed } });
};

module.exports = { processWhatsAppJob, onWhatsAppFinalFailure, buildMessage, isFinalAttempt };
