'use strict';

const crypto = require('crypto');
const cryptoUtil = require('../../shared/utils/crypto');
const emailService = require('../../services/email.service');
const User = require('../../modules/user/user.model');
const Purchase = require('../../modules/payment/purchase.model');
const Payout = require('../../modules/payout/payout.model');
const Website = require('../../modules/website/website.model');
const Auction = require('../../modules/auction/auction.model');
const Bid = require('../../modules/auction/bid.model');
const QueueJob = require('../queue/queueJob.model');
const { JOB_TYPES } = require('../queue/names');
const { permanent } = require('../queue/errors');

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

const skipped = (reason) => ({ result: { skipped: true, reason }, delivery: { skippedReason: reason } });
const accepted = (info) => ({
  result: { providerAccepted: true },
  delivery: { providerAcceptedAt: new Date(), providerMessageId: info?.messageId ? String(info.messageId) : undefined },
});

const decryptToken = (tokenEnc) => {
  try {
    return cryptoUtil.decrypt(tokenEnc);
  } catch {
    throw permanent('Token payload could not be decrypted.', 'BAD_TOKEN_PAYLOAD');
  }
};

// Only these Brevo-style failures are permanent; network/5xx/429 are retried by the worker wrapper.
const asPermanentIfRejected = (error) => {
  const status = error?.statusCode || error?.response?.status;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    const err = permanent(`Email provider rejected the message (HTTP ${status}).`, 'EMAIL_PROVIDER_REJECTED');
    err.cause = error;
    return err;
  }
  return error;
};

const handlers = {
  [JOB_TYPES.EMAIL_VERIFICATION]: async ({ userId, tokenEnc }) => {
    const user = await User.findById(userId);
    if (!user) return skipped('user_not_found');
    if (user.isVerified) return skipped('already_verified');
    const token = decryptToken(tokenEnc);
    // A newer token replaces this one: never deliver a link that can no longer work.
    if (user.verificationToken !== sha(token) || !(user.verificationTokenExpiry > Date.now())) return skipped('token_superseded_or_expired');
    return accepted(await emailService.sendVerificationEmail(user, token));
  },

  [JOB_TYPES.EMAIL_PASSWORD_RESET]: async ({ userId, tokenEnc }) => {
    const user = await User.findById(userId);
    if (!user) return skipped('user_not_found');
    const token = decryptToken(tokenEnc);
    if (user.resetPasswordToken !== sha(token) || !(user.resetPasswordExpiry > Date.now())) return skipped('token_superseded_or_expired');
    return accepted(await emailService.sendPasswordResetEmail(user, token));
  },

  [JOB_TYPES.EMAIL_WELCOME]: async ({ userId }) => {
    const user = await User.findById(userId);
    if (!user) return skipped('user_not_found');
    return accepted(await emailService.sendWelcomeEmail(user));
  },

  [JOB_TYPES.EMAIL_PURCHASE_CONFIRMATION]: async ({ purchaseId }) => {
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) return skipped('purchase_not_found');
    const [buyer, website] = await Promise.all([User.findById(purchase.buyerId), Website.findById(purchase.websiteId)]);
    if (!buyer || !website) return skipped('buyer_or_website_missing');
    return accepted(await emailService.sendPurchaseConfirmation(buyer, website, purchase));
  },

  [JOB_TYPES.EMAIL_SELLER_NOTIFICATION]: async ({ purchaseId }) => {
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) return skipped('purchase_not_found');
    const [seller, website] = await Promise.all([User.findById(purchase.sellerId), Website.findById(purchase.websiteId)]);
    if (!seller || !website) return skipped('seller_or_website_missing');
    return accepted(await emailService.sendSellerNotification(seller, website, purchase));
  },

  [JOB_TYPES.EMAIL_STATUS_UPDATE]: async ({ sellerId, websiteId, status, comment }) => {
    const [seller, website] = await Promise.all([User.findById(sellerId), Website.findById(websiteId)]);
    if (!seller || !website) return skipped('seller_or_website_missing');
    return accepted(await emailService.sendStatusUpdateEmail(seller, website, status, comment || ''));
  },

  [JOB_TYPES.EMAIL_PAYOUT_NOTIFICATION]: async ({ payoutId }) => {
    const payout = await Payout.findById(payoutId).populate('sellerId', 'name email phone').populate('websiteId', 'name');
    if (!payout || !payout.sellerId) return skipped('payout_or_seller_missing');
    return accepted(await emailService.sendPayoutNotification(payout.sellerId, payout));
  },

  [JOB_TYPES.EMAIL_ADMIN_ALERT]: async (data) => accepted(await emailService.sendAdminAlert(data)),

  [JOB_TYPES.EMAIL_OUTBID]: async ({ bidId, websiteId, previousBidderId, bidAmount }) => {
    // The bid must still exist as an accepted bid (not rolled back / cancelled).
    const bid = await Bid.findById(bidId);
    if (!bid || !['active', 'winning', 'outbid', 'won'].includes(bid.status)) return skipped('bid_not_accepted');
    const auction = await Auction.findOne({ websiteId });
    if (!auction) return skipped('auction_not_found');
    // Product rule: no point telling someone they were outbid if they are leading again,
    // or if the auction has already left the biddable states.
    if (auction.currentBidderId && String(auction.currentBidderId) === String(previousBidderId)) return skipped('bidder_regained_lead');
    if (!['active', 'first_bid_waiting'].includes(auction.status)) return skipped('auction_closed');
    const [previousBidder, website] = await Promise.all([User.findById(previousBidderId), Website.findById(websiteId)]);
    if (!previousBidder || !website) return skipped('bidder_or_website_missing');
    return accepted(await emailService.sendOutbidNotification(previousBidder, website, bidAmount));
  },
};

/**
 * Delivery guarantees: at-least-once. A retry never re-sends once the provider accepted the
 * message (recorded on the QueueJob); the only duplicate window is a crash between the provider
 * accepting and that record being written.
 */
const processEmailJob = async (job, ctx) => {
  const handler = handlers[job.name];
  if (!handler) throw permanent(`No email handler for ${job.name}`, 'UNKNOWN_JOB_TYPE');

  if (job.data?.notAfter && Date.now() > job.data.notAfter) return skipped('expired_before_delivery');

  const prior = await QueueJob.findOne({ jobKey: ctx.jobKey }).select('delivery');
  if (prior?.delivery?.providerAcceptedAt) return { result: { providerAccepted: true, duplicate: true }, delivery: prior.delivery };

  try {
    return await handler(job.data || {});
  } catch (error) {
    throw asPermanentIfRejected(error);
  }
};

module.exports = { processEmailJob, handlers };
