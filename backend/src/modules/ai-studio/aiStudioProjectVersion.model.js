const mongoose = require('mongoose');

/**
 * Metadata for an immutable snapshot of an AI Studio project's generated files, taken
 * every time the project state is synced (after a generate, an edit, a
 * debug retry, or a restore). Restoring never deletes history: it copies a
 * snapshot back onto the project and records a NEW version, so a rollback
 * can itself be rolled back.
 */
const aiStudioProjectVersionSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIStudioProject', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Monotonic per project (1, 2, 3...). Never reused, even after pruning.
    version: { type: Number, required: true },
    label: { type: String, default: '' },
    source: { type: String, enum: ['generate', 'edit', 'restore', 'sync'], default: 'sync' },
    restoredFromVersion: { type: Number, default: null },
    title: { type: String, default: null },
    // The snapshot itself is a zip in Supabase (same bucket as the project's
    // assets, under ai-studio/{projectId}/versions/). Mongo keeps only the
    // history/metadata, so the database stays small.
    storagePath: { type: String, required: true },
    fileCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

aiStudioProjectVersionSchema.index({ projectId: 1, version: -1 }, { unique: true });

module.exports = mongoose.model('AIStudioProjectVersion', aiStudioProjectVersionSchema);
