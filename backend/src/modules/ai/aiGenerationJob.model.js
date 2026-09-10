const mongoose = require('mongoose');

/**
 * DevDrop-side record of an AI Studio generation request, now backed by
 * the Genie microservice (services/genie) instead of the deleted
 * `ai-service`.
 *
 * This is deliberately NOT Genie's own generation record (which lives in
 * Genie's own Supabase `generations` table). It exists purely so DevDrop
 * can:
 *   - enforce ownership (a user may only poll/retry/modify their own jobs)
 *   - list "my AI generations" without calling Genie
 *   - keep the marketplace `Website` model untouched
 *   - hold the last known file set, so a follow-up chat-based modification
 *     (Section 5 — "change the navbar to dark blue") can be sent to Genie
 *     together with the project's current files, instead of DevDrop having
 *     to re-fetch full=true on every edit.
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
    // Genie's generation id (services/genie `generations.id`). Renamed
    // from the old ai-service's `jobId` to make the source explicit.
    genieGenerationId: {
      type: String,
      required: true,
      index: true,
    },
    // Mirrors Genie's `generations.status` exactly (pending | processing |
    // completed | failed) — one status vocabulary, not two.
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    failureMessage: { type: String, default: null },
    repairAttempts: { type: Number, default: 0 },
    previewUrl: { type: String, default: null },
    deploymentStatus: { type: String, default: null },
    // Cached from the last full=true fetch. Populated once the job
    // completes (or on-demand before a modification request) — never
    // required just to render a "generating…" progress screen.
    lastKnownFiles: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // The prompt DevDrop's adapter (services/genie/service.js) built from
    // the structured portfolio brief. Kept so a "Retry" action can
    // resubmit without asking the user to redo the wizard, and so support
    // can see exactly what was sent to Genie.
    generatedPrompt: {
      type: String,
      default: null,
    },
    // The exact structured request the frontend submitted (websiteType,
    // userData, preferences, assets), kept for the same reason.
    requestPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

aiGenerationJobSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AiGenerationJob', aiGenerationJobSchema);
