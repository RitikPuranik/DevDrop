const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { uploadMultiple, handleMulterError } = require('../middleware/uploadValidation');
const adminController = require('../controllers/adminController');

// All routes require admin authentication
router.use(auth, adminOnly);

/**
 * @route   GET /api/admin/websites/pending
 * @desc    Get pending websites for review
 * @access  Admin only
 */
router.get('/websites/pending', adminController.getPendingWebsites);

/**
 * @route   PUT /api/admin/websites/:id/request-changes
 * @desc    Request changes to a website
 * @access  Admin only
 */
router.put('/websites/:id/request-changes', adminController.requestChanges);

/**
 * @route   PUT /api/admin/websites/:id/reject
 * @desc    Reject a website
 * @access  Admin only
 */
router.put('/websites/:id/reject', adminController.rejectWebsite);

/**
 * @route   POST /api/admin/websites/:id/approve
 * @desc    Approve website and upload files
 * @access  Admin only
 */
router.post(
  '/websites/:id/approve',
  uploadMultiple.fields([
    { name: 'sourceCode', maxCount: 1 },
    { name: 'docs', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'previewVideo', maxCount: 1 },
  ]),
  handleMulterError,
  adminController.approveWebsite
);

/**
 * @route   DELETE /api/admin/websites/:id
 * @desc    Hard delete website (cascade delete)
 * @access  Admin only
 */
router.delete('/websites/:id', adminController.deleteWebsite);

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard stats
 * @access  Admin only
 */
router.get('/dashboard', adminController.getDashboard);

/**
 * @route   GET /api/admin/payouts/pending
 * @desc    Get pending payouts
 * @access  Admin only
 */
router.get('/payouts/pending', adminController.getPendingPayouts);

/**
 * @route   POST /api/admin/payouts/:id/process
 * @desc    Process a payout
 * @access  Admin only
 */
router.post('/payouts/:id/process', adminController.processPayout);

module.exports = router;