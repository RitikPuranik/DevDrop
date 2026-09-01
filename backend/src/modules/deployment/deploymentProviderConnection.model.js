const mongoose = require('mongoose');
const { DEPLOYMENT_PROVIDERS } = require('../../shared/utils/constants');

/**
 * One document per (user, provider). Generalized over Vercel and Render
 * (rather than one model per provider, like GithubConnection is for GitHub
 * alone) so a third deployment target can be added later without a schema
 * migration — only `metadata`'s shape changes per provider.
 *
 * `credentialEncrypted` holds whatever secret that provider's API needs:
 *   - vercel: OAuth access token (from the Integration Console code exchange)
 *   - render: a personal API key the user pastes in (Render has no OAuth
 *     flow for the operations DevDrop needs — see render.provider.js)
 */
const deploymentProviderConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(DEPLOYMENT_PROVIDERS),
      required: true,
    },

    // Human-readable label for the "Connected Accounts" UI, e.g. a Vercel
    // team name or the email a Render API key belongs to.
    accountLabel: { type: String, trim: true },

    credentialEncrypted: { type: String, required: true, select: false },

    // Provider-specific, non-secret context needed on later API calls:
    //   vercel: { vercelUserId, teamId, teamName }
    //   render: { owners: [{ id, name, type }], ownerId }
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

deploymentProviderConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('DeploymentProviderConnection', deploymentProviderConnectionSchema);
