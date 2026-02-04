const analyticsService = require('../services/analyticsService');

/**
 * @route   GET /api/admin/analytics/dashboard
 * @desc    Get complete dashboard analytics
 * @access  Admin only
 */
const getDashboardAnalytics = async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    // Valid periods: 'today', 'week', 'month', 'year', 'all'
    const analytics = await analyticsService.getDashboardAnalytics(period);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Admin only
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await analyticsService.getRevenueAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching revenue analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/sales
 * @desc    Get sales analytics
 * @access  Admin only
 */
const getSalesAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await analyticsService.getSalesAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get sales analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching sales analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/users
 * @desc    Get user analytics
 * @access  Admin only
 */
const getUserAnalytics = async (req, res) => {
  try {
    const analytics = await analyticsService.getUserAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/websites
 * @desc    Get website analytics
 * @access  Admin only
 */
const getWebsiteAnalytics = async (req, res) => {
  try {
    const analytics = await analyticsService.getWebsiteAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get website analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching website analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/payouts
 * @desc    Get payout analytics
 * @access  Admin only
 */
const getPayoutAnalytics = async (req, res) => {
  try {
    const analytics = await analyticsService.getPayoutAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get payout analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout analytics',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/analytics/downloads
 * @desc    Get download analytics
 * @access  Admin only
 */
const getDownloadAnalytics = async (req, res) => {
  try {
    const analytics = await analyticsService.getDownloadAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get download analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching download analytics',
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardAnalytics,
  getRevenueAnalytics,
  getSalesAnalytics,
  getUserAnalytics,
  getWebsiteAnalytics,
  getPayoutAnalytics,
  getDownloadAnalytics,
};