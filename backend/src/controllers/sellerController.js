const Website = require('../models/Website');
const BankDetails = require('../models/BankDetails');
const Purchase = require('../models/Purchase');
const Payout = require('../models/Payout');
const { WEBSITE_STATUS, WEBSITE_CATEGORIES } = require('../utils/constants');
const { getPaginationMetadata } = require('../utils/helpers');

/**
 * @route   POST /api/seller/websites
 * @desc    Submit website for review
 * @access  Private (Verified users only)
 */
const submitWebsite = async (req, res) => {
  try {
    const { name, description, category, price, deployedUrl, githubUrl } = req.body;
    const sellerId = req.userId;

    // Validate category
    if (!Object.values(WEBSITE_CATEGORIES).includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category',
      });
    }

    // Validate price based on category
    if (category === WEBSITE_CATEGORIES.FREE && price !== 0) {
      return res.status(400).json({
        success: false,
        message: 'Free websites must have price 0',
      });
    }

    if ((category === WEBSITE_CATEGORIES.PAID || category === WEBSITE_CATEGORIES.EXCLUSIVE) && price <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Paid and exclusive websites must have price greater than 0',
      });
    }

    // Check bank details for paid/exclusive websites
    if (category === WEBSITE_CATEGORIES.PAID || category === WEBSITE_CATEGORIES.EXCLUSIVE) {
      const bankDetails = await BankDetails.findOne({ userId: sellerId });

      if (!bankDetails) {
        return res.status(400).json({
          success: false,
          message: 'Please add your bank details before listing a paid website',
          requiresBankDetails: true,
        });
      }
    }

    // Create website submission
    const website = new Website({
      name,
      description,
      category,
      price,
      deployedUrl,
      githubUrl,
      sellerId,
      status: WEBSITE_STATUS.PENDING_REVIEW,
    });

    await website.save();

    res.status(201).json({
      success: true,
      message: 'Website submitted for review',
      data: website,
    });
  } catch (error) {
    console.error('Submit website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting website',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/seller/websites
 * @desc    Get seller's uploaded websites
 * @access  Private
 */
const getMyWebsites = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      sellerId: req.userId,
      isDeleted: false,
    };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    const websites = await Website.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Website.countDocuments(query);

    // Add sales count for each website
    const websitesWithStats = await Promise.all(
      websites.map(async (website) => {
        const salesCount = await Purchase.countDocuments({
          websiteId: website._id,
          paymentStatus: 'completed',
        });

        return {
          ...website.toObject(),
          salesCount,
        };
      })
    );

    res.json({
      success: true,
      data: websitesWithStats,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get my websites error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching websites',
      error: error.message,
    });
  }
};

/**
 * @route   PUT /api/seller/websites/:id
 * @desc    Update website (only if changes_requested)
 * @access  Private
 */
const updateWebsite = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, deployedUrl, githubUrl } = req.body;

    // Find website
    const website = await Website.findOne({
      _id: id,
      sellerId: req.userId,
      isDeleted: false,
    });

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Only allow updates if status is changes_requested
    if (website.status !== WEBSITE_STATUS.CHANGES_REQUESTED) {
      return res.status(400).json({
        success: false,
        message: 'You can only update websites with changes requested',
      });
    }

    // Update fields
    if (name) website.name = name;
    if (description) website.description = description;
    if (price !== undefined) {
      // Validate price based on category
      if (website.category === WEBSITE_CATEGORIES.FREE && price !== 0) {
        return res.status(400).json({
          success: false,
          message: 'Free websites must have price 0',
        });
      }
      website.price = price;
    }
    if (deployedUrl) website.deployedUrl = deployedUrl;
    if (githubUrl !== undefined) website.githubUrl = githubUrl;

    // Reset status to pending review
    website.status = WEBSITE_STATUS.PENDING_REVIEW;
    website.adminComment = undefined;

    await website.save();

    res.json({
      success: true,
      message: 'Website updated and resubmitted for review',
      data: website,
    });
  } catch (error) {
    console.error('Update website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating website',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/seller/earnings
 * @desc    Get seller earnings summary
 * @access  Private
 */
const getEarnings = async (req, res) => {
  try {
    const sellerId = req.userId;

    // Total earnings (completed purchases)
    const earningsData = await Purchase.aggregate([
      {
        $match: {
          sellerId: sellerId,
          paymentStatus: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$sellerPrice' },
          totalSales: { $sum: 1 },
        },
      },
    ]);

    const earnings = earningsData.length > 0 ? earningsData[0] : {
      totalEarnings: 0,
      totalSales: 0,
    };

    // Pending payouts
    const pendingPayouts = await Payout.aggregate([
      {
        $match: {
          sellerId: sellerId,
          status: 'pending',
        },
      },
      {
        $group: {
          _id: null,
          pendingAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const pending = pendingPayouts.length > 0 ? pendingPayouts[0] : {
      pendingAmount: 0,
      count: 0,
    };

    // Completed payouts
    const completedPayouts = await Payout.aggregate([
      {
        $match: {
          sellerId: sellerId,
          status: 'completed',
        },
      },
      {
        $group: {
          _id: null,
          paidAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const completed = completedPayouts.length > 0 ? completedPayouts[0] : {
      paidAmount: 0,
      count: 0,
    };

    // Recent sales (last 10)
    const recentSales = await Purchase.find({
      sellerId: sellerId,
      paymentStatus: 'completed',
    })
      .populate('websiteId', 'name category')
      .populate('buyerId', 'email')
      .sort({ purchaseDate: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        totalEarnings: earnings.totalEarnings,
        totalSales: earnings.totalSales,
        pendingPayouts: {
          amount: pending.pendingAmount,
          count: pending.count,
        },
        completedPayouts: {
          amount: completed.paidAmount,
          count: completed.count,
        },
        recentSales,
      },
    });
  } catch (error) {
    console.error('Get earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching earnings',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/seller/payouts
 * @desc    Get seller payouts
 * @access  Private
 */
const getPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = {
      sellerId: req.userId,
    };

    if (status) {
      query.status = status;
    }

    const payouts = await Payout.find(query)
      .populate('websiteId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payout.countDocuments(query);

    res.json({
      success: true,
      data: payouts,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payouts',
      error: error.message,
    });
  }
};

/**
 * @route   DELETE /api/seller/websites/:id
 * @desc    Delete own website (only if not approved/sold)
 * @access  Private
 */
const deleteOwnWebsite = async (req, res) => {
  try {
    const { id } = req.params;

    const website = await Website.findOne({
      _id: id,
      sellerId: req.userId,
      isDeleted: false,
    });

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Can only delete if not approved or sold
    if (website.status === WEBSITE_STATUS.APPROVED || website.status === WEBSITE_STATUS.SOLD) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved or sold websites. Please contact admin.',
      });
    }

    // Soft delete
    website.isDeleted = true;
    website.deletedAt = new Date();
    await website.save();

    res.json({
      success: true,
      message: 'Website deleted successfully',
    });
  } catch (error) {
    console.error('Delete website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting website',
      error: error.message,
    });
  }
};

module.exports = {
  submitWebsite,
  getMyWebsites,
  updateWebsite,
  getEarnings,
  getPayouts,
  deleteOwnWebsite,
};