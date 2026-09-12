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
// This login flow uses a short-lived, single-use handoff code. GitHub returns
// to the backend, the backend completes the OAuth exchange and persists the
// handoff code in the normal DevDrop MongoDB, and then redirects the popup to
// the frontend. The frontend exchanges that opaque code for the normal
// DevDrop JWT. This avoids relying on window.opener surviving a cross-origin
// OAuth navigation.
// ─────────────────────────────────────────

const GITHUB_LOGIN_STATE_EXPIRY = '10m';
const GITHUB_HANDOFF_TTL_MS = 60 * 1000;
const GITHUB_LOGIN_COOKIE = 'devdrop_github_login_nonce';

const parseCookies = (req) => {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((cookies, pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return cookies;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: GITHUB_LOGIN_STATE_EXPIRY === '10m' ? 10 * 60 * 1000 : undefined,
});

const getFrontendOrigin = () => {
  try {
    return new URL(process.env.FRONTEND_URL).origin;
  } catch {
    return process.env.FRONTEND_URL || '*';
  }
};

const getFrontendGithubCallbackUrl = (handoffToken) => {
  const origin = getFrontendOrigin();
  if (!origin || origin === '*') throw new Error('FRONTEND_URL is not configured correctly.');
  const url = new URL('/github-auth-callback.html', origin);
  url.searchParams.set('handoff', handoffToken);

  const backendOrigin = (() => {
    try {
      return new URL(
        process.env.BACKEND_URL ||
        process.env.API_URL ||
        `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000'}`
      ).origin;
    } catch {
      return null;
    }
  })();

  if (backendOrigin) url.searchParams.set('backend', backendOrigin);
  return url.toString();
};

/**
 * GET /api/auth/github
 * Public — no session exists yet. Redirects straight to GitHub's authorize
 * screen; the frontend opens this URL in a popup.
 */
const githubAuthRedirect = (req, res) => {
  if (!githubService.isGithubLoginConfigured()) {
    return res.status(503).json({ success: false, message: 'GitHub sign-in is not configured on this server yet.' });
  }

  const nonce = crypto.randomBytes(24).toString('hex');
  res.cookie(GITHUB_LOGIN_COOKIE, nonce, getCookieOptions());

  const state = jwt.sign(
    { purpose: 'github_login', nonce },
    process.env.JWT_SECRET,
    { expiresIn: GITHUB_LOGIN_STATE_EXPIRY }
  );

  res.redirect(githubService.getLoginAuthorizeUrl(state));
};

/**
 * GET /api/auth/github/callback
 * Public — GitHub redirects here after authorization. The callback completes
 * OAuth, creates/links the DevDrop account, creates a single-use handoff code,
 * and redirects the popup to the frontend callback page.
 */
const githubAuthCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  const sendFrontendError = (message) => {
    try {
      const url = new URL('/github-auth-callback.html', getFrontendOrigin());
      url.searchParams.set('error', message);
      return res.redirect(url.toString());
    } catch {
      return res.status(500).send('GitHub sign-in could not be completed.');
    }
  };

  try {
    if (oauthError) {
      return sendFrontendError('GitHub sign-in was cancelled or denied.');
    }
    if (!code || !state) {
      return sendFrontendError('Missing authorization code.');
    }

    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return sendFrontendError('This sign-in request expired. Please try again.');
    }
    if (decoded.purpose !== 'github_login') {
      return sendFrontendError('Invalid sign-in request.');
    }

    const { accessToken } = await githubService.exchangeCodeForToken(code, githubService.getLoginRedirectUri());
    const githubProfile = await githubService.getAuthenticatedUser(accessToken);
    const primaryEmail = await githubService.getPrimaryVerifiedEmail(accessToken);

    if (!primaryEmail) {
      return sendFrontendError(
        'Your GitHub account has no verified email address we can use. Please verify an email on GitHub and try again, or sign up with email/password instead.'
      );
    }

    const githubId = String(githubProfile.id);
    let user = await User.findOne({ githubId });

    if (!user) {
      const existingByEmail = await User.findOne({ email: primaryEmail });

      if (existingByEmail) {
        if (existingByEmail.githubId && existingByEmail.githubId !== githubId) {
          return sendFrontendError(
            'This email is already linked to a different GitHub account on DevDrop. Please sign in with that GitHub account instead.'
          );
        }

        existingByEmail.githubId = githubId;
        existingByEmail.githubUsername = githubProfile.username;
        existingByEmail.authProvider = 'github';
        existingByEmail.isVerified = true;
        if (!existingByEmail.avatar && githubProfile.avatarUrl) existingByEmail.avatar = githubProfile.avatarUrl;
        await existingByEmail.save();
        user = existingByEmail;
      } else {
        user = new User({
          name: githubProfile.name || githubProfile.username,
          email: primaryEmail,
          githubId,
          githubUsername: githubProfile.username,
          avatar: githubProfile.avatarUrl,
          authProvider: 'github',
          isVerified: true,
          role: 'user',
        });
        await user.save();
      }
    }

    const cookies = parseCookies(req);
    if (!decoded.nonce || cookies[GITHUB_LOGIN_COOKIE] !== decoded.nonce) {
      return sendFrontendError('Your GitHub sign-in session could not be verified. Please try again.');
    }

    const handoffToken = jwt.sign(
      {
        purpose: 'github_login_handoff',
        nonce: decoded.nonce,
        userId: String(user._id),
      },
      process.env.JWT_SECRET,
      { expiresIn: '60s', jwtid: crypto.randomBytes(16).toString('hex') }
    );

    return res.redirect(getFrontendGithubCallbackUrl(handoffToken));
  } catch (error) {
    console.error('GitHub auth callback error:', error.message);
    return sendFrontendError('Could not complete GitHub sign-in. Please try again.');
  }
};

/**
 * POST /api/auth/github/exchange
 * Public — exchanges a short-lived, single-use opaque handoff code for the
 * normal DevDrop JWT. The code is deleted atomically on successful lookup.
 */
const githubAuthExchange = async (req, res) => {
  try {
    const handoffToken = String(req.body?.handoff || '').trim();
    if (!handoffToken) {
      return res.status(400).json({ success: false, message: 'Missing GitHub sign-in handoff.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(handoffToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'This GitHub sign-in link is invalid or has expired.' });
    }

    if (decoded.purpose !== 'github_login_handoff' || !decoded.userId || !decoded.nonce) {
      return res.status(401).json({ success: false, message: 'Invalid GitHub sign-in handoff.' });
    }

    const cookies = parseCookies(req);
    if (cookies[GITHUB_LOGIN_COOKIE] !== decoded.nonce) {
      return res.status(401).json({ success: false, message: 'GitHub sign-in session could not be verified.' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'The DevDrop account for this GitHub sign-in no longer exists.' });
    }

    const token = generateAccessToken(user._id);
    const avatarUrl = await getPublicAssetUrl(user.avatar);

    res.clearCookie(GITHUB_LOGIN_COOKIE, { path: '/api/auth' });

    return res.json({
      success: true,
      message: 'GitHub login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          avatar: avatarUrl,
        },
        token,
      },
    });
  } catch (error) {
    console.error('GitHub auth exchange error:', error.message);
    return res.status(500).json({ success: false, message: 'Could not complete GitHub sign-in.' });
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
  githubAuthExchange,
  sendVerificationEmail,
  verifyEmail,
  resendVerification,
  getMe,
  forgotPassword,
  resetPassword,
};
