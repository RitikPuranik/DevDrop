const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payout = require('../models/Payout');
const BankDetails = require('../models/BankDetails');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../utils/constants');
const emailService = require('../services/emailService');
const User = require('../models/User');

/**
 * @route   POST /api/buyer/purchase/:websiteId
 * @desc    Purchase a free website
 * @access  Private (Verified users only)
 */
const purchaseFreeWebsite = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const buyerId = req.userId;

    // Find website
    const website = await Website.findOne({
      _id: websiteId,
      isDeleted: false,
    }).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Check if website is approved
    if (website.status !== WEBSITE_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        message: 'This website is not available for purchase',
      });
    }

    // Check if category is free
    if (website.category !== 'free') {
      return res.status(400).json({
        success: false,
        message: 'This is not a free website. Please use payment flow.',
      });
    }

    // Check if already purchased
    const existingPurchase = await Purchase.findOne({
      websiteId,
      buyerId,
    });

    if (existingPurchase) {
      return res.status(400).json({
        success: false,
        message: 'You have already purchased this website',
      });
    }

    // Create purchase record
    const purchase = new Purchase({
      websiteId,
      buyerId,
      sellerId: website.sellerId._id,
      category: website.category,
      sellerPrice: 0,
      platformFee: 0,
      tax: 0,
      totalPaid: 0,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      purchaseDate: new Date(),
    });

    await purchase.save();

    // Send confirmation emails
    const buyer = await User.findById(buyerId);
    try {
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    } catch (emailError) {
      console.error('Failed to send emails:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Website purchased successfully',
      data: {
        purchase,
        website: {
          id: website._id,
          name: website.name,
          category: website.category,
        },
      },
    });
  } catch (error) {
    console.error('Purchase free website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing purchase',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/buyer/check-purchase/:websiteId
 * @desc    Check if user has purchased a website
 * @access  Private
 */
const checkPurchase = async (req, res) => {
  try {
    const { websiteId } = req.params;

    const purchase = await Purchase.findOne({
      websiteId,
      buyerId: req.userId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    });

    res.json({
      success: true,
      data: {
        hasPurchased: !!purchase,
        purchase: purchase || null,
      },
    });
  } catch (error) {
    console.error('Check purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking purchase',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/buyer/my-purchases
 * @desc    Get buyer's purchase history
 * @access  Private
 */
const getMyPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const purchases = await Purchase.find({
      buyerId: req.userId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    })
      .populate('websiteId', 'name description category price deployedUrl')
      .populate('sellerId', 'email')
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Purchase.countDocuments({
      buyerId: req.userId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
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
    console.error('Get my purchases error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchases',
      error: error.message,
    });
  }
};

module.exports = {
  purchaseFreeWebsite,
  checkPurchase,
  getMyPurchases,
};