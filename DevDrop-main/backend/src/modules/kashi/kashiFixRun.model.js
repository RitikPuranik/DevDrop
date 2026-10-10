const mongoose = require('mongoose');

/**
 * One Kashi "fix my failed Vercel build" run for a deployment: the loop
 * (read build log -> minimal fix -> push -> redeploy -> check) and a
 * human-readable step log the UI polls.
 */
const stepSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    round: { type: Number, default: 0 },
    kind: { type: String, enum: ['info', 'fix', 'error', 'success'], default: 'info' },
    message: { type: String, required: true },
    commitSha: String,
    files: [String],
  },
  { _id: false }
);

const RUN_STATUS = ['queued', 'running', 'succeeded', 'failed', 'cannot_fix', 'cancelled'];

const kashiFixRunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deployment', required: true, index: true },
    status: { type: String, enum: RUN_STATUS, default: 'queued', index: true },
    round: { type: Number, default: 0 },
    maxRounds: { type: Number, default: 6 },
    steps: { type: [stepSchema], default: [] },
    commits: { type: [String], default: [] },
    finalUrl: String,
    resultMessage: String,
    // After a successful frontend fix, a deployment that also has a backend /
    // env-sync phase still needs DevDrop's normal Redeploy to finish.
    needsRedeploy: { type: Boolean, default: false },
    finishedAt: Date,
  },
  { timestamps: true }
);

kashiFixRunSchema.index({ deploymentId: 1, createdAt: -1 });

module.exports = mongoose.model('KashiFixRun', kashiFixRunSchema);
module.exports.RUN_STATUS = RUN_STATUS;
