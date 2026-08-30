const mongoose = require('mongoose');

/**
 * One GitHub OAuth connection per DevDrop user. Kept as its own collection
 * (rather than fields on User) so the encrypted token stays out of the
 * User document entirely — same pattern this codebase already uses for
 * BankDetails.
 */
const githubConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    githubUserId: { type: Number, required: true },
    githubUsername: { type: String, required: true, trim: true },
    githubAvatarUrl: { type: String, trim: true },

    // AES-256-GCM encrypted access token — never select this by default,
    // and never send it to the frontend.
    accessTokenEncrypted: { type: String, required: true, select: false },
    scope: { type: String, trim: true },

    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GithubConnection', githubConnectionSchema);
