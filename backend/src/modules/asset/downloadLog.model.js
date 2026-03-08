const mongoose = require('mongoose');

const downloadLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
    },

    // File details
    fileType: {
      type: String,
      enum: ['sourceCode', 'docs', 'video'],
      required: true,
    },
    fileName: String,
    fileSize: Number,

    // Download metadata
    ipAddress: String,
    userAgent: String,
    downloadedAt: {
      type: Date,
      default: Date.now,
    },

    // Fraud detection
    isSuspicious: {
      type: Boolean,
      default: false,
    },
    suspicionReason: String,
  },
  {
    timestamps: false,
  }
);

// Analytics & audit indexes
downloadLogSchema.index({ websiteId: 1, downloadedAt: -1 });
downloadLogSchema.index({ userId: 1, downloadedAt: -1 });
downloadLogSchema.index({ isSuspicious: 1, downloadedAt: -1 });

module.exports = mongoose.model('DownloadLog', downloadLogSchema);
