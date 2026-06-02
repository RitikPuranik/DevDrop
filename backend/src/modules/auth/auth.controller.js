const User = require('../user/user.model');
const { generateAccessToken } = require('../../shared/utils/jwt');
const { hashToken } = require('../../shared/utils/helpers');
const emailService = require('../../services/email.service');

const signup = async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) return res.status(400).json({ success: false, message: 'User with this phone number already exists' });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'User with this email already exists' });

    const user = new User({ name, phone, email, password, role: 'user', isVerified: false });
    await user.save();

    const token = generateAccessToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: { user: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified }, token },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating user', error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    const user = await User.findOne({ $or: [{ email: emailOrPhone }, { phone: emailOrPhone }] }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = generateAccessToken(user._id);
    res.json({ success: true, message: 'Login successful', data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified }, token } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error logging in', error: error.message });
  }
};

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

    // Atomic update — only succeeds if token exists AND user is not yet verified.
    // This prevents the race condition where two simultaneous requests both read
    // isVerified=false, then both send a welcome email.
    const user = await User.findOneAndUpdate(
      {
        verificationToken: hashedToken,
        verificationTokenExpiry: { $gt: Date.now() },
        isVerified: false,  // only match unverified users
      },
      {
        $set: { isVerified: true },
        $unset: { verificationToken: '', verificationTokenExpiry: '' },
      },
      { new: true }
    );

    if (!user) {
      // Could be: token invalid, expired, OR already verified (idempotent 200)
      const alreadyVerified = await User.findOne({ isVerified: true });
      if (alreadyVerified) {
        return res.json({ success: true, message: 'Email already verified' });
      }
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }

    // Exactly one request will reach here — safe to send welcome email
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
    res.json({ success: true, data: { id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role, isVerified: user.isVerified, createdAt: user.createdAt } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If this email exists, a reset link has been sent' });

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
  sendVerificationEmail, 
  verifyEmail, 
  resendVerification, 
  getMe, 
  forgotPassword, 
  resetPassword 
};