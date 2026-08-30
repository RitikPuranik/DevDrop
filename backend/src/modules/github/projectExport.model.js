const mongoose = require('mongoose');
const { EXPORT_STATUS, EXPORT_VISIBILITY } = require('../../shared/utils/constants');

const projectExportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
      index: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
    },

    provider: { type: String, enum: ['github'], default: 'github' },

    repositoryName: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 350 },
    visibility: {
      type: String,
      enum: Object.values(EXPORT_VISIBILITY),
      required: true,
    },

    // Filled in once the repository actually exists on GitHub.
    repositoryUrl: String,
    repositoryOwner: String,
    defaultBranch: String,
    fileCount: Number,

    status: {
      type: String,
      enum: Object.values(EXPORT_STATUS),
      default: EXPORT_STATUS.PENDING,
      index: true,
    },
    errorMessage: String,
  },
  { timestamps: true }
);

projectExportSchema.index({ userId: 1, createdAt: -1 });
projectExportSchema.index({ userId: 1, websiteId: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectExport', projectExportSchema);
