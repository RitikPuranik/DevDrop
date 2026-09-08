const mongoose = require('mongoose');

/**
 * DevDrop-side record of an AI Studio generation request.
 *
 * This is deliberately NOT the AI-service's own job/project store (which
 * lives in the FastAPI service's own storage layer — see
 * ai-service/storage/). It exists purely so DevDrop can:
 *   - enforce ownership (a user may only poll/retry their own jobs)
 *   - list "my AI generations" without calling the AI service
 *   - keep the marketplace `Website` model untouched (Section 25)
 *
 * Full synchronization into a first-class DevDrop project record is
 * explicitly deferred — see Section 24/Deferred Work in the phase report.
 */
const aiGenerationJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    websiteType: {
      type: String,
      enum: ['portfolio'],
      required: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    projectId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    currentStage: {
      type: String,
      default: 'QUEUED',
    },
    failureCode: { type: String, default: null },
    failureMessage: { type: String, default: null },
    repairAttempts: { type: Number, default: 0 },
    // Idempotency key used for the most recent attempt tied to this
    // record, so a retry can be told apart from a duplicate submit.
    idempotencyKey: {
      type: String,
      default: null,
    },
    // The exact structured request sent to the AI service, kept so a
    // "Retry" action can resubmit without asking the user to redo the form.
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

aiGenerationJobSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AiGenerationJob', aiGenerationJobSchema);
