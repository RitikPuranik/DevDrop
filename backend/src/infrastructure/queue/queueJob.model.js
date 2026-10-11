'use strict';

const mongoose = require('mongoose');

// One durable status record per background job (all three queues).
// Queue state itself lives in Redis (BullMQ); this collection is what users/admins read,
// what survives a Redis loss, and what makes workers idempotent across retries.
const STATUSES = ['queued', 'active', 'delayed', 'completed', 'failed', 'cancelled'];
const TERMINAL = ['completed', 'failed', 'cancelled'];

const queueJobSchema = new mongoose.Schema(
  {
    jobKey: { type: String, required: true, unique: true, index: true },
    queue: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    refType: { type: String },
    refId: { type: String, index: true },
    status: { type: String, enum: STATUSES, default: 'queued', index: true },
    progress: { type: Number, default: 0 },
    currentStage: { type: String, default: 'queued' },
    stageStatus: { type: String, default: 'queued' },
    mode: { type: String },
    // "Waiting for Gemini capacity" state reported by the ai-service worker, and failure kind.
    statusMessage: { type: String },
    waitingUntil: { type: String },
    errorType: { type: String },
    attemptsMade: { type: Number, default: 0 },
    quotaDelays: { type: Number, default: 0 },
    // Large AI inputs stay in Mongo (never Redis); cleared when the job reaches a terminal state.
    payload: { type: mongoose.Schema.Types.Mixed, select: false },
    // Kept only so a failed AI job can be debug-retried; contains generated source, never secrets.
    debugContext: { type: mongoose.Schema.Types.Mixed, select: false },
    generationMeta: { type: mongoose.Schema.Types.Mixed },
    result: { type: mongoose.Schema.Types.Mixed },
    resultRef: { type: String },
    error: { code: String, message: String, class: String },
    // Email jobs: queue acceptance, provider acceptance and delivery are tracked separately.
    delivery: {
      providerAcceptedAt: Date,
      providerMessageId: String,
      deliveryConfirmedAt: Date,
      skippedReason: String,
    },
    // Outbox: for durable jobs the intent is written here BEFORE publishing to Redis.
    // publishPending stays true until BullMQ has accepted the job; a sweeper republishes stragglers.
    publishPending: { type: Boolean, default: false, index: true },
    publishData: { type: mongoose.Schema.Types.Mixed, select: false },
    publishOpts: { type: mongoose.Schema.Types.Mixed, select: false },
    publishAttempts: { type: Number, default: 0 },
    enqueuedAt: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

queueJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
queueJobSchema.index({ queue: 1, status: 1, createdAt: -1 });

queueJobSchema.statics.STATUSES = STATUSES;
queueJobSchema.statics.TERMINAL = TERMINAL;

module.exports = mongoose.models.QueueJob || mongoose.model('QueueJob', queueJobSchema);
