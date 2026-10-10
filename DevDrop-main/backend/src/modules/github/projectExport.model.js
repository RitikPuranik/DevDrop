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
    // Marketplace exports reference a purchased Website + Purchase. AI Studio
    // exports have neither -- they reference aiStudioProjectId instead.
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      index: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
    },
    aiStudioProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIStudioProject',
      index: true,
    },
    source: { type: String, enum: ['marketplace', 'ai-studio'], default: 'marketplace' },

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
projectExportSchema.index({ userId: 1, aiStudioProjectId: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectExport', projectExportSchema);
