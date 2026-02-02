const User = require('../models/User');
const BankDetails = require('../models/BankDetails');
const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payout = require('../models/Payout');
const Wishlist = require('../models/Wishlist');

/**
 * @route   GET /api/user/profile
 * @desc    Get user profile
 * @access  Private
 */
const getProfile = async (req, res) => {
  try {
    const user = req.user;

    // Get bank details if exists
    const bankDetails = await BankDetails.findOne({ userId: user._id });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
        },
        hasBankDetails: !!bankDetails,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/user/bank-details
 * @desc    Add/Update bank details
 * @access  Private
 */
const saveBankDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      branch,
      upiId,
    } = req.body;

    // Check if bank details already exist
    let bankDetails = await BankDetails.findOne({ userId });

    if (bankDetails) {
      // Update existing
      bankDetails.accountHolderName = accountHolderName;
      bankDetails.accountNumber = accountNumber;
      bankDetails.ifscCode = ifscCode.toUpperCase();
      bankDetails.bankName = bankName;
      bankDetails.branch = branch;
      bankDetails.upiId = upiId || bankDetails.upiId;

      await bankDetails.save();

      return res.json({
        success: true,
        message: 'Bank details updated successfully',
        data: bankDetails,
      });
    }

    // Create new
    bankDetails = new BankDetails({
      userId,
      accountHolderName,
      accountNumber,
      ifscCode: ifscCode.toUpperCase(),
      bankName,
      branch,
      upiId,
    });

    await bankDetails.save();

    res.status(201).json({
      success: true,
      message: 'Bank details saved successfully',
      data: bankDetails,
    });
  } catch (error) {
    console.error('Save bank details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving bank details',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/user/bank-details
 * @desc    Get user's bank details
 * @access  Private
 */
const getBankDetails = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.userId });

    if (!bankDetails) {
      return res.status(404).json({
        success: false,
        message: 'Bank details not found',
      });
    }

    res.json({
      success: true,
      data: bankDetails,
    });
  } catch (error) {
    console.error('Get bank details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank details',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/user/dashboard
 * @desc    Get user dashboard data
 * @access  Private
 */
const getDashboard = async (req, res) => {
  try {
    const userId = req.userId;

    // Get uploaded websites count
    const uploadedWebsites = await Website.countDocuments({
      sellerId: userId,
      isDeleted: false,
    });

    // Get purchases count
    const purchases = await Purchase.countDocuments({
      buyerId: userId,
      paymentStatus: 'completed',
    });

    // Get wishlist count
    const wishlistCount = await Wishlist.countDocuments({ userId });

    // Get earnings (total seller price from completed purchases)
    const earnings = await Purchase.aggregate([
      {
        $match: {
          sellerId: userId,
          paymentStatus: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$sellerPrice' },
        },
      },
    ]);

    const totalEarnings = earnings.length > 0 ? earnings[0].total : 0;

    // Get pending payouts
    const pendingPayouts = await Payout.countDocuments({
      sellerId: userId,
      status: 'pending',
    });

    res.json({
      success: true,
      data: {
        uploadedWebsites,
        purchases,
        wishlistCount,
        totalEarnings,
        pendingPayouts,
      },
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/user/purchases
 * @desc    Get user's purchases
 * @access  Private
 */
const getPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const purchases = await Purchase.find({
      buyerId: req.userId,
      paymentStatus: 'completed',
    })
      .populate('websiteId', 'name description category price deployedUrl')
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Purchase.countDocuments({
      buyerId: req.userId,
      paymentStatus: 'completed',
    });

    res.json({
      success: true,
      data: purchases,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchases',
      error: error.message,
    });
  }
};

module.exports = {
  getProfile,
  saveBankDetails,
  getBankDetails,
  getDashboard,
  getPurchases,
};