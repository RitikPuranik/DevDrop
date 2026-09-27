const mongoose = require('mongoose');

/**
 * A single browser tab/session currently (or recently) attached to a
 * project. Multiple tabs can be open on the same project (Section 13) —
 * the project is only "abandoned" once every session is stale AND the
 * project-level lastActivityAt is also past the inactivity threshold.
 */
const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    lastHeartbeatAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AI_STUDIO_PROJECT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  CLEANING: 'CLEANING',
  DELETED: 'DELETED',
};

const aiStudioProjectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // The tab/session that most recently created or resumed this project.
    // Kept for quick lookups; the authoritative "who's still open" data is
    // the `sessions` array below.
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    sessions: {
      type: [sessionSchema],
      default: [],
    },
    title: {
      type: String,
      default: null,
    },
    websiteType: {
      type: String,
      default: 'portfolio',
    },
    // Storage isolation boundary — every Supabase object for this project
    // lives under this prefix (ai-studio/{projectId}/...). Stored explicitly
    // (rather than re-derived from _id everywhere) so cleanup always has the
    // exact prefix to remove, even if the id format ever changes.
    storagePrefix: {
      type: String,
      required: true,
    },
    zipPath: {
      type: String,
      default: null,
    },
    // Current complete generated file map (path -> contents) and package
    // dependencies. This is the source of truth used to regenerate
    // project.zip on every edit — the ZIP itself is a derived artifact.
    files: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    dependencies: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(AI_STUDIO_PROJECT_STATUS),
      default: AI_STUDIO_PROJECT_STATUS.ACTIVE,
      index: true,
    },
    // Updated on MEANINGFUL activity (generate, edit, asset upload/delete,
    // download, resume, ...) — this is what cleanup keys off of. NOT a
    // fixed-lifetime timestamp.
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Updated by the lightweight periodic heartbeat while the tab is open
    // and visible.
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
    },
    lastVisibleAt: {
      type: Date,
      default: Date.now,
    },
    // Set once cleanup starts actually deleting things, so a crashed/retried
    // cleanup run knows this project was already mid-flight rather than
    // silently orphaning storage.
    cleanupAttempts: {
      type: Number,
      default: 0,
    },
    lastCleanupError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

aiStudioProjectSchema.index({ status: 1, lastActivityAt: 1 });
aiStudioProjectSchema.index({ userId: 1, status: 1 });

aiStudioProjectSchema.methods.touchActivity = function touchActivity(at = new Date()) {
  this.lastActivityAt = at;
  this.lastHeartbeatAt = at;
  if (this.status === AI_STUDIO_PROJECT_STATUS.INACTIVE) {
    this.status = AI_STUDIO_PROJECT_STATUS.ACTIVE;
  }
};

module.exports = mongoose.model('AIStudioProject', aiStudioProjectSchema);
module.exports.AI_STUDIO_PROJECT_STATUS = AI_STUDIO_PROJECT_STATUS;
