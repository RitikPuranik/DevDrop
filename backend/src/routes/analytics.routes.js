const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { auth, adminOnly } = require('../middleware/auth');

/**
 * @route   GET /api/admin/analytics/dashboard
 * @desc    Get complete dashboard analytics
 * @access  Admin only
 * @query   period: 'today', 'week', 'month', 'year', 'all' (default: 'all')
 */
router.get('/dashboard', auth, adminOnly, analyticsController.getDashboardAnalytics);

/**
 * @route   GET /api/admin/analytics/revenue
 * @desc    Get revenue analytics
 * @access  Admin only
 * @query   startDate, endDate (optional)
 */
router.get('/revenue', auth, adminOnly, analyticsController.getRevenueAnalytics);

/**
 * @route   GET /api/admin/analytics/sales
 * @desc    Get sales analytics
 * @access  Admin only
 * @query   startDate, endDate (optional)
 */
router.get('/sales', auth, adminOnly, analyticsController.getSalesAnalytics);

/**
 * @route   GET /api/admin/analytics/users
 * @desc    Get user analytics
 * @access  Admin only
 */
router.get('/users', auth, adminOnly, analyticsController.getUserAnalytics);

/**
 * @route   GET /api/admin/analytics/websites
 * @desc    Get website analytics
 * @access  Admin only
 */
router.get('/websites', auth, adminOnly, analyticsController.getWebsiteAnalytics);

/**
 * @route   GET /api/admin/analytics/payouts
 * @desc    Get payout analytics
 * @access  Admin only
 */
router.get('/payouts', auth, adminOnly, analyticsController.getPayoutAnalytics);

/**
 * @route   GET /api/admin/analytics/downloads
 * @desc    Get download analytics
 * @access  Admin only
 */
router.get('/downloads', auth, adminOnly, analyticsController.getDownloadAnalytics);

module.exports = router;