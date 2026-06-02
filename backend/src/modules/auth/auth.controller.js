const { OAuth2Client } = require('google-auth-library');
const User = require('../user/user.model');
const { generateAccessToken } = require('../../shared/utils/jwt');
const { hashToken } = require('../../shared/utils/helpers');
const emailService = require('../../services/email.service');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: { user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified, avatar: user.avatar }, token },
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

    const user = await User.findOne({ $or: [{ email: emailOrPhone }, { phone: emailOrPhone }] }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ success: false, message: 'This account uses Google Sign-In. Please login with Google.' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateAccessToken(user._id);
    res.json({ success: true, message: 'Login successful', data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatar: user.avatar }, token } });
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

    res.json({
      success: true,
      message: 'Google login successful',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, avatar: user.avatar },
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
    res.json({ success: true, data: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified, avatar: user.avatar, createdAt: user.createdAt } });
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

    if (user.authProvider === 'google') {
      return res.status(400).json({ success: false, message: 'This account uses Google Sign-In. Password reset is not available.' });
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

module.exports = { signup, login, googleAuth, sendVerificationEmail, verifyEmail, resendVerification, getMe, forgotPassword, resetPassword };
