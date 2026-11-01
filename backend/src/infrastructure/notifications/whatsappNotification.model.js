'use strict';

const mongoose = require('mongoose');

// Domain-level delivery record for every WhatsApp notification (one row per LOGICAL event).
// The generic QueueJob record still tracks the BullMQ job; this one answers "was the admin actually told?".
const STATUSES = ['pending', 'sending', 'sent', 'failed', 'unconfirmed', 'skipped'];
const TYPES = ['SUBSCRIPTION_PURCHASED', 'SUBSCRIPTION_RENEWED', 'WEBSITE_PURCHASED', 'ADMIN_REPORT', 'WHATSAPP_TEST'];
const CATEGORIES = ['subscription', 'renewal', 'websitePurchase', 'adminReport', 'test'];

const schema = new mongoose.Schema(
  {
    // Stable business identity, e.g. "sub-paid-<orderId>". Unique => one logical notification per event,
    // however many webhooks / retries / page refreshes produce it, and across worker restarts.
    eventKey: { type: String, required: true, unique: true },
    type: { type: String, enum: TYPES, required: true, index: true },
    category: { type: String, enum: CATEGORIES, required: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    refType: { type: String },
    refId: { type: String, index: true },
    // Short, non-sensitive label for the history table (e.g. "Pro · ₹799.00"). Never an email or phone.
    summary: { type: String },
    // Minimal inputs the worker needs (record ids; for reports/tests the rendered text). Never returned by the API.
    context: { type: mongoose.Schema.Types.Mixed, select: false },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    queueJobKey: { type: String }, // BullMQ job key of the most recent enqueue
    recipientMasked: { type: String },
    attempts: { type: Number, default: 0 }, // send attempts actually started
    ambiguousAttempts: { type: Number, default: 0 },
    manualRetries: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
    providerMessageId: { type: String },
    skippedReason: { type: String },
    failure: { code: String, message: String, retryable: Boolean, ambiguous: Boolean },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

schema.index({ createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

schema.statics.STATUSES = STATUSES;
schema.statics.TYPES = TYPES;
schema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.models.WhatsAppNotification || mongoose.model('WhatsAppNotification', schema);
