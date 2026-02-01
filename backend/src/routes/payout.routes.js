const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
// Payout routes - Admin only

router.use(auth);

/**
 * @route   GET /api/payout/my-payouts
 * @desc    Get seller's payouts
 * @access  Private
 */
router.get('/my-payouts', async (req, res) => {
  res.json({ message: 'Get my payouts - To be implemented' });
});

module.exports = router;