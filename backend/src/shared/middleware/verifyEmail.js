const events = require('../../infrastructure/events');

const verifyEmail = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) return res.status(401).json({ success: false, message: 'Authentication required.' });
    if (user.isVerified) return next();

    try { await events.requestVerificationEmail(user); } catch (e) { console.error('Verification email could not be queued:', e.message); }

    return res.status(403).json({
      success: false,
      message: 'Please verify your email to perform this action. A verification email has been requested.',
      requiresVerification: true,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error checking email verification.', error: error.message });
  }
};

module.exports = verifyEmail;
