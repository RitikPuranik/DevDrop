'use strict';

/**
 * Pure rules for "can this deployment be restored to production without a
 * rebuild?". Used twice: against the stored DeploymentVersion (to decorate
 * the history list cheaply) and against a freshly-fetched Vercel deployment
 * (the authoritative pre-flight right before a rollback).
 *
 * Vercel's rules this encodes (docs: "Instant Rollback" / "Promoting Deployments"):
 *  - Instant Rollback restores a deployment that has previously served
 *    production traffic ("PROMOTED"), by re-pointing domains — no rebuild.
 *  - A production deployment that never served traffic ("STAGED", only
 *    possible when auto-assignment of production domains is off) is brought
 *    live with a *promote*, which also does not rebuild.
 *  - Preview deployments are not eligible: promoting a preview requires a
 *    full rebuild, which DevDrop does not do as part of a "rollback".
 *  - Plan limits (Hobby: previous production deployment only) are enforced
 *    by Vercel; they cannot be known up front, so they surface as a
 *    PLAN_RESTRICTION error from the API instead of being guessed here.
 */

const REASONS = Object.freeze({
  ALREADY_LIVE: { code: 'ALREADY_LIVE', message: 'This deployment is already serving production.' },
  PREVIEW_NOT_ELIGIBLE: { code: 'PREVIEW_NOT_ELIGIBLE', message: 'Preview deployments can\'t be restored to production without a rebuild. Only production deployments can be rolled back.' },
  NOT_READY: { code: 'NOT_READY', message: 'Only successfully built (Ready) deployments can be restored.' },
  UNAVAILABLE: { code: 'UNAVAILABLE', message: 'Vercel no longer has this deployment (it expired or was deleted).' },
  PROJECT_MISMATCH: { code: 'PROJECT_MISMATCH', message: 'This deployment does not belong to the connected Vercel project.' },
});

/**
 * @param {object} d   { environment, state, readySubstate, availability?, projectId? }
 * @param {object} ctx { isCurrentProduction?: boolean, expectedProjectId?: string }
 * @returns {{ eligible: boolean, kind: ('rollback'|'promote'|null), reason: (object|null) }}
 */
const evaluateEligibility = (d, ctx = {}) => {
  if (ctx.isCurrentProduction) return { eligible: false, kind: null, reason: REASONS.ALREADY_LIVE };
  if (d.availability === 'unavailable') return { eligible: false, kind: null, reason: REASONS.UNAVAILABLE };
  if (ctx.expectedProjectId && d.projectId && d.projectId !== ctx.expectedProjectId) {
    return { eligible: false, kind: null, reason: REASONS.PROJECT_MISMATCH };
  }
  if (d.environment !== 'production') return { eligible: false, kind: null, reason: REASONS.PREVIEW_NOT_ELIGIBLE };
  if (d.state !== 'READY') return { eligible: false, kind: null, reason: REASONS.NOT_READY };

  // STAGED = built for production but never promoted; promote (not rollback) brings it live.
  const kind = d.readySubstate === 'STAGED' ? 'promote' : 'rollback';
  return { eligible: true, kind, reason: null };
};

module.exports = { evaluateEligibility, REASONS };
