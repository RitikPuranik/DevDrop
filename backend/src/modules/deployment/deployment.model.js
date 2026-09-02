const mongoose = require('mongoose');
const {
  DEPLOYMENT_STATUS,
  DEPLOYMENT_ARCHITECTURE,
  DEPLOYMENT_PROVIDERS,
} = require('../../shared/utils/constants');

// One entry per environment variable the analyzer found the project reading.
// Never holds the actual secret value — just enough to render the "what do
// you need to fill in" form and to know, later, whether it was ever
// successfully pushed to the provider.
const envPlanEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    target: { type: String, enum: ['frontend', 'backend'], required: true },
    // 'auto'  -> DevDrop generates/synchronizes this itself (NODE_ENV, the
    //            frontend<->backend URL pair) and never asks the buyer for it.
    // 'user'  -> the buyer must supply the value (DATABASE_URL, JWT_SECRET, ...).
    source: { type: String, enum: ['auto', 'user'], required: true },
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
    // Optional: only marketplace-sourced deployments (see `source` below)
    // are tied to a purchased listing. A "personal" deployment — the user's
    // own GitHub repository, deployed without ever buying it from DevDrop —
    // has neither a websiteId nor a purchaseId.
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: false,
      default: null,
      index: true,
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: false,
      default: null,
    },
    // 'marketplace' -> deploying a project purchased on DevDrop (websiteId/
    //                   purchaseId set, ownership re-verified server-side).
    // 'personal'    -> deploying the user's own GitHub repository directly;
    //                   never gated on having purchased anything.
    source: {
      type: String,
      enum: ['marketplace', 'personal'],
      default: 'marketplace',
      index: true,
    },
    projectExportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectExport',
      required: false,
      default: null,
    },

    // Snapshot of the GitHub repo this deployment targets. projectExportId
    // is populated for DevDrop-published repos; externally-selected GitHub
    // repos are supported too, so this snapshot is the deployment source of truth.
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

    // Structured analyzer output (frameworks, root dirs, build/start
    // commands, detected architecture) — see services/deployment/analyzer.js.
    // Snapshotted once analysis completes so re-opening a deployment's
    // details doesn't require re-analyzing the repo.
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },

    envPlan: { type: [envPlanEntrySchema], default: [] },
    // Buyer-supplied secret values, held encrypted only long enough for the
    // orchestrator to push them to Vercel/Render, then cleared. Never
    // returned by any API response (select: false).
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
    // Which orchestration phase failed (e.g. "DEPLOYING_BACKEND") — shown in
    // the UI so a retry / support request knows where things stopped.
    errorStep: String,

    lastDeployedAt: Date,
  },
  { timestamps: true }
);

deploymentSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ userId: 1, websiteId: 1, createdAt: -1 });

module.exports = mongoose.model('Deployment', deploymentSchema);
