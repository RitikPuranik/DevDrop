const Payout = require('../models/Payout');
const Purchase = require('../models/Purchase');
const Website = require('../models/Website');
const User = require('../models/User');
const { PAYOUT_STATUS } = require('../utils/constants');
const { getPaginationMetadata } = require('../utils/helpers');
const emailService = require('../services/emailService');

/**
 * @route   GET /api/payout/pending
 * @desc    Get all pending payouts (Admin only)
 * @access  Admin
 */
const getPendingPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const payouts = await Payout.find({ status: PAYOUT_STATUS.PENDING })
      .populate('sellerId', 'name email phone')
      .populate('websiteId', 'name category price')
      .populate('purchaseId', 'totalPaid purchaseDate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payout.countDocuments({ status: PAYOUT_STATUS.PENDING });

    res.json({
      success: true,
      data: payouts,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get pending payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending payouts',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/payout/all
 * @desc    Get all payouts with filters (Admin only)
 * @access  Admin
 */
const getAllPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sellerId } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (sellerId) filter.sellerId = sellerId;

    const payouts = await Payout.find(filter)
      .populate('sellerId', 'name email phone')
      .populate('websiteId', 'name category price')
      .populate('purchaseId', 'totalPaid purchaseDate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payout.countDocuments(filter);

    res.json({
      success: true,
      data: payouts,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get all payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payouts',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payout/:id/process
 * @desc    Mark payout as completed (Admin pays seller)
 * @access  Admin
 */
const processPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { utr, transactionDate, notes } = req.body;

    // Validate UTR
    if (!utr || utr.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'UTR (Transaction Reference) is required',
      });
    }

    const payout = await Payout.findById(id)
      .populate('sellerId', 'name email phone')
      .populate('websiteId', 'name');

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found',
      });
    }

    if (payout.status !== PAYOUT_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: `Payout is already ${payout.status}`,
      });
    }

    // Update payout
    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.utr = utr;
    payout.transactionDate = transactionDate || new Date();
    payout.processedBy = req.userId; // Admin who processed
    payout.processedAt = new Date();
    payout.notes = notes;

    await payout.save();

    // Send notification email to seller
    try {
      await emailService.sendPayoutNotification(payout.sellerId, payout);
    } catch (emailError) {
      console.error('Failed to send payout notification:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Payout processed successfully',
      data: payout,
    });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing payout',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/payout/seller/:sellerId
 * @desc    Get seller's payout history
 * @access  Private (Seller can view their own, Admin can view any)
 */
const getSellerPayouts = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Check authorization
    if (req.userRole !== 'admin' && req.userId.toString() !== sellerId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const payouts = await Payout.find({ sellerId })
      .populate('websiteId', 'name category price')
      .populate('purchaseId', 'totalPaid purchaseDate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payout.countDocuments({ sellerId });

    // Calculate summary
    const summary = await Payout.aggregate([
      { $match: { sellerId: require('mongoose').Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    res.json({
      success: true,
      data: payouts,
      summary: {
        pending: summary.find(s => s._id === 'pending') || { count: 0, totalAmount: 0 },
        completed: summary.find(s => s._id === 'completed') || { count: 0, totalAmount: 0 },
        failed: summary.find(s => s._id === 'failed') || { count: 0, totalAmount: 0 },
      },
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get seller payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching seller payouts',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/payout/stats
 * @desc    Get payout statistics (Admin only)
 * @access  Admin
 */
const getPayoutStats = async (req, res) => {
  try {
    const stats = await Payout.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const formattedStats = {
      pending: stats.find(s => s._id === 'pending') || { count: 0, totalAmount: 0 },
      processing: stats.find(s => s._id === 'processing') || { count: 0, totalAmount: 0 },
      completed: stats.find(s => s._id === 'completed') || { count: 0, totalAmount: 0 },
      failed: stats.find(s => s._id === 'failed') || { count: 0, totalAmount: 0 },
    };

    res.json({
      success: true,
      data: formattedStats,
    });
  } catch (error) {
    console.error('Get payout stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payout statistics',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payout/:id/fail
 * @desc    Mark payout as failed
 * @access  Admin
 */
const failPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Failure reason is required',
      });
    }

    const payout = await Payout.findById(id)
      .populate('sellerId', 'name email');

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found',
      });
    }

    payout.status = PAYOUT_STATUS.FAILED;
    payout.failureReason = reason;
    payout.processedBy = req.userId;
    payout.processedAt = new Date();

    await payout.save();

    res.json({
      success: true,
      message: 'Payout marked as failed',
      data: payout,
    });
  } catch (error) {
    console.error('Fail payout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking payout as failed',
      error: error.message,
    });
  }
};

module.exports = {
  getPendingPayouts,
  getAllPayouts,
  processPayout,
  getSellerPayouts,
  getPayoutStats,
  failPayout,
};