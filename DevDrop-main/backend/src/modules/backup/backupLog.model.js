const mongoose = require('mongoose');

const backupLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['mongo', 'supabase', 'full'],
      required: true,
    },
    direction: {
      type: String,
      enum: ['main_to_backup', 'backup_to_main'],
      required: true,
    },
    trigger: {
      type: String,
      enum: ['manual', 'scheduled'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['success', 'partial', 'failed'],
      required: true,
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

backupLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackupLog', backupLogSchema);
