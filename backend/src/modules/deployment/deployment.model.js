const mongoose = require('mongoose');
const {
  DEPLOYMENT_STATUS,
  DEPLOYMENT_ARCHITECTURE,
  DEPLOYMENT_PROVIDERS,
} = require('../../shared/utils/constants');

// One entry per environment variable the analyzer found the project reading.
// Never holds the actual secret value. It records enough metadata to render
// the configuration form and to know which automatic values must be re-synced.
const envPlanEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    target: { type: String, enum: ['frontend', 'backend'], required: true },
    // 'auto' -> DevDrop generates/synchronizes this itself.
    // 'user' -> the buyer must supply the value.
    source: { type: String, enum: ['auto', 'user'], required: true },
    // The analyzer uses this to distinguish automatic values such as the
    // deployed frontend/backend URL pair. It MUST survive persistence so the
    // orchestrator can detect when a second synchronization phase is needed.
    autoRole: {
      type: String,
      enum: ['frontend-url', 'backend-url', 'static'],
      required: false,
      default: undefined,
    },
    required: { type: Boolean, default: true },
    configured: { type: Boolean, default: false },
  },
  { _id: false }
);

const deploymentSchema = new mongoose.Schema(
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
    projectExportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectExport',
      required: true,
    },
    repository: {
      owner: String,
      name: String,
      url: String,
      defaultBranch: String,
    },
    architecture: {
      type: String,
      enum: Object.values(DEPLOYMENT_ARCHITECTURE),
      default: DEPLOYMENT_ARCHITECTURE.UNKNOWN,
    },
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    envPlan: { type: [envPlanEntrySchema], default: [] },
    // Buyer-supplied secret values, encrypted and cleared after a successful
    // deployment. Never returned by API responses.
    pendingSecretsEncrypted: { type: String, select: false, default: null },

    frontendProvider: {
      type: String,
      enum: [...Object.values(DEPLOYMENT_PROVIDERS), null],
      default: null,
    },
    backendProvider: {
      type: String,
      enum: [...Object.values(DEPLOYMENT_PROVIDERS), null],
      default: null,
    },

    vercel: {
      projectId: String,
      projectName: String,
      deploymentId: String,
      teamId: String,
      url: String,
    },
    render: {
      serviceId: String,
      deployId: String,
      ownerId: String,
      url: String,
    },

    status: {
      type: String,
      enum: Object.values(DEPLOYMENT_STATUS),
      default: DEPLOYMENT_STATUS.ANALYZING,
      index: true,
    },
    errorMessage: String,
    errorStep: String,
    lastDeployedAt: Date,
  },
  { timestamps: true }
);

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ userId: 1, websiteId: 1, createdAt: -1 });

deploymentSchema.index(
  { userId: 1, websiteId: 1, status: 1 },
  {
    name: 'deployment_active_lookup',
    partialFilterExpression: {
      status: {
        $in: [
          DEPLOYMENT_STATUS.QUEUED,
          DEPLOYMENT_STATUS.ANALYZING,
          DEPLOYMENT_STATUS.SYNCHRONIZING_ENV,
          DEPLOYMENT_STATUS.DEPLOYING_BACKEND,
          DEPLOYMENT_STATUS.DEPLOYING_FRONTEND,
          DEPLOYMENT_STATUS.REDEPLOYING_BACKEND,
        ],
      },
    },
  }
);

module.exports = mongoose.model('Deployment', deploymentSchema);
