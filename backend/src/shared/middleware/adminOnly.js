/**
 * Middleware to check if user is an admin
 */
const adminOnly = (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.',
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authorization error.',
      error: error.message,
    });
  }
};

module.exports = adminOnly;