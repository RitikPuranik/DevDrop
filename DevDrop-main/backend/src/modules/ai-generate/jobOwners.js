/**
 * Maps jobId -> owning DevDrop userId, in-memory, on the backend.
 *
 * ai-service is an internal trusted service with no concept of DevDrop
 * users, so ownership must be enforced here, using the already-verified
 * `req.userId` from the auth middleware — never a userId from the client.
 * Entries expire so this doesn't grow unbounded (mirrors ai-service's own
 * job TTL).
 */

const OWNER_TTL_MS = Number.parseInt(process.env.AI_JOB_TTL_MS || String(30 * 60 * 1000), 10);

const owners = new Map(); // jobId -> { userId, expiresAt }

function record(jobId, userId) {
  owners.set(jobId, { userId: String(userId), expiresAt: Date.now() + OWNER_TTL_MS });
}

function isOwner(jobId, userId) {
  const entry = owners.get(jobId);
  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    owners.delete(jobId);
    return false;
  }
  return entry.userId === String(userId);
}

module.exports = { record, isOwner };
