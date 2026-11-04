const mongoose = require('mongoose');
const { ROLLBACK_STATUS, ROLLBACK_ACTIVE_STATUSES } = require('../../shared/utils/constants');

/**
 * One rollback (or promote) attempt. Rows are never deleted: together they
 * are the audit trail of "who asked for what, and what actually happened".
 *
 * `active` is true while the operation holds the per-Vercel-project lock.
 * A partial unique index on (vercelProjectId, active:true) makes it
 * impossible for two operations to run against the same project at once —
 * Vercel itself only allows one rollback at a time per project.
 *
 * Contains no tokens and no log content.
 */
const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: { type: String, required: true },
    message: { type: String, maxlength: 500 },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const rollbackOperationSchema = new mongoose.Schema(
  {
    deploymentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vercelProjectId: { type: String, required: true },

    // 'rollback' = POST /v1/projects/:id/rollback/:deploymentId (previously-promoted deployment)
    // 'promote'  = POST /v10/projects/:id/promote/:deploymentId (staged production deployment)
    kind: { type: String, enum: ['rollback', 'promote'], required: true },

    targetVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeploymentVersion', required: true },
    targetVersionNumber: { type: Number, required: true },
    targetVercelDeploymentId: { type: String, required: true },

    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeploymentVersion', default: null },
    previousVersionNumber: { type: Number, default: null },
    previousVercelDeploymentId: { type: String, default: null },

    status: { type: String, enum: Object.values(ROLLBACK_STATUS), default: ROLLBACK_STATUS.PENDING, index: true },
    active: { type: Boolean, default: true },

    // Client-supplied (or generated) key so a double-click / network retry maps to one operation.
    idempotencyKey: { type: String, default: null, maxlength: 100 },
    retryOf: { type: mongoose.Schema.Types.ObjectId, ref: 'RollbackOperation', default: null },
    reason: { type: String, default: null, maxlength: 200 },

    requestedAt: { type: Date, default: Date.now },
    // Vercel returned 2xx for the rollback/promote call.
    acceptedAt: { type: Date, default: null },
    // True when the request's outcome is unknown (timeout / 5xx) and must be reconciled, never blindly re-sent.
    outcomeUnknown: { type: Boolean, default: false },
    verifyDeadline: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    error: {
      code: String,
      message: String,
      httpStatus: Number,
      retryable: { type: Boolean, default: false },
    },
    // After a successful rollback Vercel disables auto-assignment of production domains.
    autoAssignAffected: { type: Boolean, default: null },

    requestIp: { type: String, default: null },
    events: { type: [eventSchema], default: [] },
  },
  { timestamps: true }
);

rollbackOperationSchema.index(
  { vercelProjectId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: 'one_active_operation_per_project' }
);
rollbackOperationSchema.index(
  { deploymentRef: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'idempotency_per_site' }
);
rollbackOperationSchema.index({ deploymentRef: 1, createdAt: -1 });

rollbackOperationSchema.statics.ACTIVE_STATUSES = ROLLBACK_ACTIVE_STATUSES;

module.exports = mongoose.model('RollbackOperation', rollbackOperationSchema);
