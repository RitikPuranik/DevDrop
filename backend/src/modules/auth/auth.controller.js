const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../user/user.model');
const { generateAccessToken } = require('../../shared/utils/jwt');
const { hashToken } = require('../../shared/utils/helpers');
const emailService = require('../../services/email.service');
const supabaseService = require('../../services/supabase.service');
const githubService = require('../../services/github.service');

const getPublicAssetUrl = async (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  try {
    return await supabaseService.createSignedUrl(filePath, 7200);
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
};

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Display label for account-linking messages — covers both existing OAuth
// providers plus GitHub, without hardcoding "Google" in every message.
const getProviderLabel = (provider) => {
  if (provider === 'google') return 'Google';
  if (provider === 'github') return 'GitHub';
  return null;
};

const getAuthErrorStatus = (error, fallbackStatus = 500) => {
  if (error?.code === 11000 || error?.name === 'ValidationError') {
    return 400;
  }

  return fallbackStatus;
};

const getAuthErrorMessage = (error, fallbackMessage) => {
  if (error?.code === 11000) {
    if (error.keyPattern?.phone) return 'User with this phone number already exists';
    if (error.keyPattern?.email) return 'User with this email already exists';
    if (error.keyPattern?.googleId) return 'This Google account is already linked to another user';
    if (error.keyPattern?.githubId) return 'This GitHub account is already linked to another user';
  }

  if (error?.name === 'ValidationError') {
    const firstValidationError = Object.values(error.errors || {})[0];
    if (firstValidationError?.message) return firstValidationError.message;
  }

  return error?.message || fallbackMessage;
};

// ─────────────────────────────────────────
// LOCAL AUTH
// ─────────────────────────────────────────

const signup = async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) return res.status(400).json({ success: false, message: 'User with this phone number already exists' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'User with this email already exists' });

    const user = new User({ name, phone: phone || undefined, email, password, role: 'user', isVerified: false, authProvider: 'local' });
    await user.save();

    const token = generateAccessToken(user._id);
    const avatarUrl = await getPublicAssetUrl(user.avatar);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: { user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified, avatar: avatarUrl }, token },
    });
  } catch (error) {
    res.status(getAuthErrorStatus(error)).json({
      success: false,
      message: getAuthErrorMessage(error, 'Error creating user'),
    });
  }
};

const login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    // Normalize the input the same way signup does (express-validator normalizeEmail)
    // so lookups match the stored value.
    let normalizedInput = emailOrPhone;
    const isEmail = emailOrPhone && emailOrPhone.includes('@');
    if (isEmail) {
      // Replicate express-validator's normalizeEmail defaults:
      // lowercase the entire address, and for Gmail remove dots from local part
      normalizedInput = emailOrPhone.toLowerCase().trim();
      const [localPart, domain] = normalizedInput.split('@');
      if (domain === 'gmail.com' || domain === 'googlemail.com') {
        normalizedInput = localPart.replace(/\./g, '') + '@' + domain;
      }
    }

    const user = await User.findOne({ $or: [{ email: normalizedInput }, { phone: emailOrPhone }] }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (!user.password) {
      const providerLabel = getProviderLabel(user.authProvider) || 'social';
      return res.status(400).json({ success: false, message: `This account uses ${providerLabel} Sign-In. Please login with ${providerLabel}.` });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateAccessToken(user._id);
    const avatarUrl = await getPublicAssetUrl(user.avatar);
    res.json({ success: true, message: 'Login successful', data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatar: avatarUrl }, token } });
  } catch (error) {
    res.status(getAuthErrorStatus(error)).json({
      success: false,
      message: getAuthErrorMessage(error, 'Error logging in'),
    });
  }
};

// ─────────────────────────────────────────
// GOOGLE OAUTH
// ─────────────────────────────────────────

const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Google credential is required' });

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) return res.status(400).json({ success: false, message: 'Could not retrieve email from Google account' });

    // Find existing user by googleId OR email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Link Google to existing local account if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        user.isVerified = true;
        if (!user.avatar && picture) user.avatar = picture;
        await user.save();
      }
    } else {
      // Create brand-new OAuth user
      user = new User({
        name,
        email,
        googleId,
        avatar: picture,
        authProvider: 'google',
        isVerified: true, // Google accounts are pre-verified
        role: 'user',
      });
      await user.save();
    }

    const token = generateAccessToken(user._id);
    const avatarUrl = await getPublicAssetUrl(user.avatar);

    res.json({
      success: true,
      message: 'Google login successful',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatar: avatarUrl },
        token,
      },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(getAuthErrorStatus(error, 401)).json({
      success: false,
      message: getAuthErrorMessage(error, 'Google authentication failed'),
    });
  }
};

// ─────────────────────────────────────────
// GITHUB OAUTH ("Continue with GitHub")
//
// This is a SEPARATE OAuth flow from modules/github (repo export/
// integrations): its own scope (identity-only, no `repo` access), its own
// callback route/redirect URI, and its own signed `state.purpose` so a
// state minted here can never be replayed against the export callback (or
// vice versa). It reuses the popup + postMessage pattern and GITHUB_CLIENT_
// ID/SECRET already set up for that flow — see backend/src/services/
// github.service.js.
// ─────────────────────────────────────────

const GITHUB_LOGIN_STATE_EXPIRY = '10m';

const getFrontendOrigin = () => {
  try {
    return new URL(process.env.FRONTEND_URL).origin;
  } catch {
    return process.env.FRONTEND_URL || '*';
  }
};

// Safely embeds a JS value inside an inline <script> block.
const toScriptLiteral = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const renderGithubAuthResultPage = (payload) => `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /><title>GitHub sign-in</title></head>
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

/**
 * GET /api/auth/github
 * Public — no session exists yet. Redirects straight to GitHub's authorize
 * screen; the frontend just opens this URL in a popup (no preceding API
 * call needed, unlike the repo-export /connect endpoint, since there's no
 * logged-in user id to embed until GitHub redirects back).
 */
const githubAuthRedirect = (req, res) => {
  if (!githubService.isGithubLoginConfigured()) {
    return res.status(503).json({ success: false, message: 'GitHub sign-in is not configured on this server yet.' });
  }

  const state = jwt.sign(
    { purpose: 'github_login', nonce: crypto.randomBytes(8).toString('hex') },
    process.env.JWT_SECRET,
    { expiresIn: GITHUB_LOGIN_STATE_EXPIRY }
  );

  res.redirect(githubService.getLoginAuthorizeUrl(state));
};

/**
 * GET /api/auth/github/callback
 * Public — GitHub redirects the user's browser here with no auth header.
 * Renders a page that postMessages the result (token + user, or an error)
 * back to the opener window and closes itself, mirroring the repo-export
 * callback in modules/github/github.controller.js.
 */
const githubAuthCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  try {
    if (oauthError) {
      return res.send(renderGithubAuthResultPage({ type: 'github-auth-error', message: 'GitHub sign-in was cancelled or denied.' }));
    }
    if (!code || !state) {
      return res.send(renderGithubAuthResultPage({ type: 'github-auth-error', message: 'Missing authorization code.' }));
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.send(renderGithubAuthResultPage({ type: 'github-auth-error', message: 'This sign-in request expired. Please try again.' }));
    }
    if (decoded.purpose !== 'github_login') {
      return res.send(renderGithubAuthResultPage({ type: 'github-auth-error', message: 'Invalid sign-in request.' }));
    }

    const { accessToken } = await githubService.exchangeCodeForToken(code, githubService.getLoginRedirectUri());
    const githubProfile = await githubService.getAuthenticatedUser(accessToken);
    const primaryEmail = await githubService.getPrimaryVerifiedEmail(accessToken);

    if (!primaryEmail) {
      return res.send(renderGithubAuthResultPage({
        type: 'github-auth-error',
        message: 'Your GitHub account has no verified email address we can use. Please verify an email on GitHub and try again, or sign up with email/password instead.',
      }));
    }

    const githubId = String(githubProfile.id);
    let user = await User.findOne({ githubId });

    if (!user) {
      const existingByEmail = await User.findOne({ email: primaryEmail });

      if (existingByEmail) {
        // Scenario 4 (email conflict): this verified GitHub email already
        // belongs to a DevDrop account that's linked to a *different*
        // GitHub identity. Don't guess which one is right — refuse instead
        // of silently re-linking or merging.
        if (existingByEmail.githubId && existingByEmail.githubId !== githubId) {
          return res.send(renderGithubAuthResultPage({
            type: 'github-auth-error',
            message: 'This email is already linked to a different GitHub account on DevDrop. Please sign in with that GitHub account instead.',
          }));
        }

        // Scenario 3: existing local/Google account, verified email matches —
        // safely link GitHub to it without touching password or other data.
        existingByEmail.githubId = githubId;
        existingByEmail.githubUsername = githubProfile.username;
        existingByEmail.authProvider = 'github';
        existingByEmail.isVerified = true;
        if (!existingByEmail.avatar && githubProfile.avatarUrl) existingByEmail.avatar = githubProfile.avatarUrl;
        await existingByEmail.save();
        user = existingByEmail;
      } else {
        // Scenario 1: brand-new user.
        user = new User({
          name: githubProfile.name || githubProfile.username,
          email: primaryEmail,
          githubId,
          githubUsername: githubProfile.username,
          avatar: githubProfile.avatarUrl,
          authProvider: 'github',
          isVerified: true, // GitHub verified this email for us
          role: 'user',
        });
        await user.save();
      }
    }
    // else Scenario 2: githubId already linked — just log them in as-is.

    const token = generateAccessToken(user._id);
    const avatarUrl = await getPublicAssetUrl(user.avatar);

    return res.send(renderGithubAuthResultPage({
      type: 'github-auth-success',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatar: avatarUrl },
    }));
  } catch (error) {
    console.error('GitHub auth callback error:', error.message);
    return res.send(renderGithubAuthResultPage({ type: 'github-auth-error', message: 'Could not complete GitHub sign-in. Please try again.' }));
  }
};

// ─────────────────────────────────────────
// EMAIL VERIFICATION
// ─────────────────────────────────────────

const sendVerificationEmail = async (req, res) => {
  try {
    const user = req.user;
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Email is already verified' });
    await emailService.sendVerificationEmail(user);
    res.json({ success: true, message: 'Verification email sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send verification email', error: error.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Verification token is required' });

    const hashedToken = hashToken(token);

    const user = await User.findOneAndUpdate(
      { verificationToken: hashedToken, verificationTokenExpiry: { $gt: Date.now() }, isVerified: false },
      { $set: { isVerified: true }, $unset: { verificationToken: '', verificationTokenExpiry: '' } },
      { new: true }
    );

    if (!user) {
      const alreadyVerified = await User.findOne({ isVerified: true });
      if (alreadyVerified) return res.json({ success: true, message: 'Email already verified' });
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    try { await emailService.sendWelcomeEmail(user); } catch (e) { console.error('Welcome email failed:', e); }
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error verifying email', error: error.message });
  }
};

const resendVerification = async (req, res) => {
  try {
    const user = req.user;
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Email is already verified' });
    await emailService.sendVerificationEmail(user);
    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error sending verification email', error: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = req.user;
    const avatarUrl = await getPublicAssetUrl(user.avatar);
    res.json({ success: true, data: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified, avatar: avatarUrl, createdAt: user.createdAt } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
  }
};

// ─────────────────────────────────────────
// PASSWORD RESET
// ─────────────────────────────────────────

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If this email exists, a reset link has been sent' });

    if (!user.password) {
      const providerLabel = getProviderLabel(user.authProvider) || 'social';
      return res.status(400).json({ success: false, message: `This account uses ${providerLabel} Sign-In. Password reset is not available.` });
    }

    const resetToken = user.generateResetPasswordToken();
    await user.save();
    await emailService.sendPasswordResetEmail(user, resetToken);

    res.json({ success: true, message: 'Password reset link sent to email' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error sending reset email', error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: 'Token and new password are required' });

    const hashedToken = hashToken(token);
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpiry: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error resetting password', error: error.message });
  }
};

module.exports = {
  signup,
  login,
  googleAuth,
  githubAuthRedirect,
  githubAuthCallback,
  sendVerificationEmail,
  verifyEmail,
  resendVerification,
  getMe,
  forgotPassword,
  resetPassword,
};
