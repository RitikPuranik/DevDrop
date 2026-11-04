const mongoose = require('mongoose');
const { VERSION_ENVIRONMENT, VERSION_STATE } = require('../../shared/utils/constants');

/**
 * One document per Vercel deployment of a DevDrop site's frontend project
 * (a "site" is a Deployment document — see deployment.model.js).
 *
 * This is DevDrop's persistent mapping between a human-friendly version
 * number ("v7") and the real Vercel deployment id. It stores NO credentials
 * and NO log content.
 *
 * Role of a record (derived, see versionSync.service.getSummary):
 *   - current production : isCurrentProduction === true (at most one per site, enforced by a partial unique index)
 *   - latest             : newest by vercelCreatedAt
 *   - latest successful  : newest with state READY
 *   - historical         : everything else
 */
const deploymentVersionSchema = new mongoose.Schema(
  {
    // The DevDrop site (Deployment document) this version belongs to.
    deploymentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true },
    // Denormalized so every query can be scoped to the owner in a single filter.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', default: null },

    vercelProjectId: { type: String, required: true },
    vercelDeploymentId: { type: String, required: true },
    url: { type: String, default: null },

    // Chronological, per-site, assigned once and never changed.
    versionNumber: { type: Number, required: true, min: 1 },

    commitSha: { type: String, default: null },
    commitMessage: { type: String, default: null, maxlength: 500 },
    commitRef: { type: String, default: null },

    environment: { type: String, enum: Object.values(VERSION_ENVIRONMENT), required: true },
    state: { type: String, enum: Object.values(VERSION_STATE), default: VERSION_STATE.UNKNOWN },
    // Vercel production sub-state: STAGED (never served traffic) | ROLLING | PROMOTED (has served traffic).
    readySubstate: { type: String, default: null },

    isCurrentProduction: { type: Boolean, default: false },
    // Set when DevDrop observes this deployment serving production (informational).
    lastProductionAt: { type: Date, default: null },

    vercelCreatedAt: { type: Date, required: true },
    buildingAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },

    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null, maxlength: 500 },

    // 'devdrop' = created by DevDrop's own deploy flow; 'external' = dashboard / git push / other integration.
    origin: { type: String, enum: ['devdrop', 'external'], default: 'external' },
    // Set when Vercel reports the deployment gone (404/410) so the UI can disable actions.
    availability: { type: String, enum: ['available', 'unavailable'], default: 'available' },

    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deploymentVersionSchema.index({ deploymentRef: 1, vercelDeploymentId: 1 }, { unique: true });
deploymentVersionSchema.index({ deploymentRef: 1, versionNumber: 1 }, { unique: true });
// At most one "current production" version per site.
deploymentVersionSchema.index(
  { deploymentRef: 1 },
  { unique: true, partialFilterExpression: { isCurrentProduction: true }, name: 'one_current_production_per_site' }
);
deploymentVersionSchema.index({ deploymentRef: 1, vercelCreatedAt: -1 });
deploymentVersionSchema.index({ vercelDeploymentId: 1 });
deploymentVersionSchema.index({ vercelProjectId: 1 });

module.exports = mongoose.model('DeploymentVersion', deploymentVersionSchema);
