const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const GithubConnection = require('./githubConnection.model');
const ProjectExport = require('./projectExport.model');
const githubService = require('../../services/github.service');
const projectExportService = require('../../services/projectExport.service');
const cryptoUtil = require('../../shared/utils/crypto');
const { PAYMENT_STATUS, EXPORT_STATUS } = require('../../shared/utils/constants');

const OAUTH_STATE_EXPIRY = '10m';

const getFrontendOrigin = () => {
  try {
    return new URL(process.env.FRONTEND_URL).origin;
  } catch {
    return process.env.FRONTEND_URL || '*';
  }
};

// Safely embeds a JS value inside an inline <script> block.
const toScriptLiteral = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const renderOAuthResultPage = (payload) => `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>GitHub connection</title></head>
  <body style="font-family: sans-serif; background:#0b0b0b; color:#ece5d8; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
    <p>You can close this window now…</p>
    <script>
      (function () {
        var result = ${toScriptLiteral(payload)};
        var targetOrigin = ${toScriptLiteral(getFrontendOrigin())};
        try {
          if (window.opener) {
            window.opener.postMessage(result, targetOrigin);
          }
        } catch (e) {}
        window.close();
      })();
    </script>
  </body>
</html>`;

// ─────────────────────────────────────────
// GITHUB OAUTH
// ─────────────────────────────────────────

/**
 * POST /api/github/connect
 * Returns the GitHub authorize URL for the frontend to open in a popup.
 * The state param is a short-lived signed token identifying the requesting
 * user, since GitHub's redirect back to /callback carries no auth header.
 */
const connect = async (req, res) => {
  try {
    if (!githubService.isGithubConfigured()) {
      return res.status(503).json({ success: false, message: 'GitHub integration is not configured on this server yet.' });
    }

    const state = jwt.sign({ userId: req.userId.toString(), purpose: 'github_oauth', nonce: crypto.randomBytes(8).toString('hex') }, process.env.JWT_SECRET, {
      expiresIn: OAUTH_STATE_EXPIRY,
    });

    res.json({ success: true, data: { authorizeUrl: githubService.getAuthorizeUrl(state) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not start GitHub connection.', error: error.message });
  }
};

/**
 * GET /api/github/callback
 * Public route — GitHub redirects the user's browser here with no auth
 * header, so identity comes entirely from the signed `state` param.
 */
const callback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  try {
    if (oauthError) {
      return res.send(renderOAuthResultPage({ type: 'github-oauth-error', message: 'GitHub authorization was cancelled or denied.' }));
    }
    if (!code || !state) {
      return res.send(renderOAuthResultPage({ type: 'github-oauth-error', message: 'Missing authorization code.' }));
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.send(renderOAuthResultPage({ type: 'github-oauth-error', message: 'This connection request expired. Please try again.' }));
    }
    if (decoded.purpose !== 'github_oauth' || !decoded.userId) {
      return res.send(renderOAuthResultPage({ type: 'github-oauth-error', message: 'Invalid connection request.' }));
    }

    const { accessToken, scope } = await githubService.exchangeCodeForToken(code);
    const githubUser = await githubService.getAuthenticatedUser(accessToken);

    await GithubConnection.findOneAndUpdate(
      { userId: decoded.userId },
      {
        userId: decoded.userId,
        githubUserId: githubUser.id,
        githubUsername: githubUser.username,
        githubAvatarUrl: githubUser.avatarUrl,
        accessTokenEncrypted: cryptoUtil.encrypt(accessToken),
        scope,
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.send(renderOAuthResultPage({ type: 'github-oauth-success', username: githubUser.username }));
  } catch (error) {
    console.error('GitHub OAuth callback error:', error.message);
    res.send(renderOAuthResultPage({ type: 'github-oauth-error', message: 'Could not complete GitHub authorization. Please try again.' }));
  }
};

/**
 * GET /api/github/status
 */
const status = async (req, res) => {
  try {
    const connection = await GithubConnection.findOne({ userId: req.userId });
    res.json({
      success: true,
      data: connection
        ? { connected: true, username: connection.githubUsername, avatarUrl: connection.githubAvatarUrl, connectedAt: connection.connectedAt }
        : { connected: false },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking GitHub connection', error: error.message });
  }
};

/**
 * DELETE /api/github/disconnect
 */
const disconnect = async (req, res) => {
  try {
    await GithubConnection.deleteOne({ userId: req.userId });
    res.json({ success: true, message: 'GitHub disconnected.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error disconnecting GitHub', error: error.message });
  }
};

// ─────────────────────────────────────────
// PROJECT EXPORT
// ─────────────────────────────────────────

/**
 * POST /api/github/export/:websiteId
 */
const createExport = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.userId;
    const { repositoryName, description, visibility } = req.body;

    // Never trust the frontend — re-verify the purchase server-side.
    const purchase = await Purchase.findOne({ websiteId, buyerId: userId, paymentStatus: PAYMENT_STATUS.COMPLETED });
    if (!purchase) {
      return res.status(403).json({ success: false, message: 'You do not own this project.' });
    }

    const website = await Website.findById(websiteId);
    if (!website || !website.sourceCodeUrl) {
      return res.status(400).json({ success: false, message: 'This project\'s source files are not available for export.' });
    }

    const connection = await GithubConnection.findOne({ userId });
    if (!connection) {
      return res.status(400).json({ success: false, message: 'Connect your GitHub account before exporting.', requiresGithubConnection: true });
    }

    const sanitizedName = projectExportService.sanitizeRepoName(repositoryName);
    if (!projectExportService.isValidRepoName(sanitizedName)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid repository name.' });
    }

    const exportDoc = await ProjectExport.create({
      userId,
      websiteId,
      purchaseId: purchase._id,
      repositoryName: sanitizedName,
      description: description?.trim() || `${website.name} — purchased from DevDrop`,
      visibility,
      status: EXPORT_STATUS.PENDING,
    });

    // Fire-and-forget: the HTTP response returns immediately with the
    // exportId; the frontend polls GET /exports/:exportId for progress.
    setImmediate(() => {
      projectExportService.runExport(exportDoc._id).catch((err) => {
        console.error(`Unhandled error running export ${exportDoc._id}:`, err);
      });
    });

    res.status(202).json({ success: true, data: { exportId: exportDoc._id, status: exportDoc.status } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error starting GitHub export', error: error.message });
  }
};

const serializeExport = (exportDoc) => ({
  id: exportDoc._id,
  websiteId: exportDoc.websiteId,
  repositoryName: exportDoc.repositoryName,
  visibility: exportDoc.visibility,
  status: exportDoc.status,
  repositoryUrl: exportDoc.repositoryUrl || null,
  defaultBranch: exportDoc.defaultBranch || null,
  fileCount: exportDoc.fileCount || null,
  errorMessage: exportDoc.errorMessage || null,
  createdAt: exportDoc.createdAt,
  updatedAt: exportDoc.updatedAt,
});

/**
 * GET /api/github/exports/:exportId
 */
const getExportStatus = async (req, res) => {
  try {
    const exportDoc = await ProjectExport.findOne({ _id: req.params.exportId, userId: req.userId });
    if (!exportDoc) return res.status(404).json({ success: false, message: 'Export not found' });
    res.json({ success: true, data: serializeExport(exportDoc) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching export status', error: error.message });
  }
};

/**
 * GET /api/github/exports/website/:websiteId
 * Lets the "Push to GitHub" UI show the most recent export for this
 * project without the user needing to re-trigger one.
 */
const getExportForWebsite = async (req, res) => {
  try {
    const exportDoc = await ProjectExport.findOne({ websiteId: req.params.websiteId, userId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: exportDoc ? serializeExport(exportDoc) : null });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching export', error: error.message });
  }
};

/**
 * GET /api/github/exports
 */
const listExports = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const exportsList = await ProjectExport.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ProjectExport.countDocuments({ userId: req.userId });

    res.json({
      success: true,
      data: exportsList.map(serializeExport),
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalItems: total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching exports', error: error.message });
  }
};

module.exports = {
  connect,
  callback,
  status,
  disconnect,
  createExport,
  getExportStatus,
  getExportForWebsite,
  listExports,
};
