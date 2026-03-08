const emailService = require('../../services/email.service');

const verifyEmail = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) return res.status(401).json({ success: false, message: 'Authentication required.' });
    if (user.isVerified) return next();

    try { await emailService.sendVerificationEmail(user); } catch (e) { console.error('Verification email failed:', e); }

    return res.status(403).json({
      success: false,
      message: 'Please verify your email to perform this action. A verification email has been sent.',
      requiresVerification: true,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error checking email verification.', error: error.message });
  }
};

module.exports = verifyEmail;
