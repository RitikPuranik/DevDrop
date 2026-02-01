const emailService = require('../services/emailService');

/**
 * Middleware to check if user's email is verified
 * Blocks action and sends verification email if not verified
 */
const verifyEmail = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Check if email is verified
    if (user.isVerified) {
      return next();
    }

    // Email not verified - send verification email
    try {
      await emailService.sendVerificationEmail(user);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Continue even if email fails - user should still know to verify
    }

    return res.status(403).json({
      success: false,
      message: 'Please verify your email to perform this action. A verification email has been sent.',
      requiresVerification: true,
    });

  } catch (error) {
    console.error('Verification check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking email verification.',
      error: error.message,
    });
  }
};

module.exports = verifyEmail;