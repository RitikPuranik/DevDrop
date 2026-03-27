const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const Payout = require('../payout/payout.model');
const Wishlist = require('../wishlist/wishlist.model');
const DownloadLog = require('../asset/downloadLog.model');
const Payment = require('../payment/payment.model');
const User = require('../user/user.model');
const { WEBSITE_STATUS, PAYOUT_STATUS } = require('../../shared/utils/constants');
const { getPaginationMetadata } = require('../../shared/utils/helpers');
const supabaseService = require('../../services/supabase.service');
const emailService = require('../../services/email.service');

/**
 * @route   GET /api/admin/websites/pending
 * @desc    Get pending websites for review
 * @access  Admin only
 */
const getPendingWebsites = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const websites = await Website.find({
      status: WEBSITE_STATUS.PENDING_REVIEW,
      isDeleted: false,
    })
      .populate('sellerId', 'email createdAt')
      .sort({ createdAt: 1 }) // Oldest first
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Website.countDocuments({
      status: WEBSITE_STATUS.PENDING_REVIEW,
      isDeleted: false,
    });

    res.json({
      success: true,
      data: websites,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get pending websites error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending websites',
      error: error.message,
    });
  }
};

/**
 * @route   PUT /api/admin/websites/:id/request-changes
 * @desc    Request changes to a website
 * @access  Admin only
 */
const requestChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment is required',
      });
    }

    const website = await Website.findById(id).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Update website
    website.status = WEBSITE_STATUS.CHANGES_REQUESTED;
    website.adminComment = comment;
    await website.save();

    // Send email to seller
    try {
      await emailService.sendStatusUpdateEmail(
        website.sellerId,
        website,
        WEBSITE_STATUS.CHANGES_REQUESTED,
        comment
      );
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({
      success: true,
      message: 'Changes requested successfully',
      data: website,
    });
  } catch (error) {
    console.error('Request changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting changes',
      error: error.message,
    });
  }
};

/**
 * @route   PUT /api/admin/websites/:id/reject
 * @desc    Reject a website
 * @access  Admin only
 */
const rejectWebsite = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required',
      });
    }

    const website = await Website.findById(id).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Update website
    website.status = WEBSITE_STATUS.REJECTED;
    website.adminComment = reason;
    await website.save();

    // Send email to seller
    try {
      await emailService.sendStatusUpdateEmail(
        website.sellerId,
        website,
        WEBSITE_STATUS.REJECTED,
        reason
      );
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({
      success: true,
      message: 'Website rejected successfully',
      data: website,
    });
  } catch (error) {
    console.error('Reject website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting website',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/admin/websites/:id/approve
 * @desc    Approve website and upload files
 * @access  Admin only
 */
const approveWebsite = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;
    const { deployedLink } = req.body; // Get deployed link from request body

    // Validate deployed link
    if (!deployedLink || deployedLink.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Deployed link is required',
      });
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlPattern.test(deployedLink)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid URL for deployed link',
      });
    }

    // Validate files (video is optional)
    if (!files || !files.sourceCode || !files.docs) {
      return res.status(400).json({
        success: false,
        message: 'Source code and documentation files are required',
      });
    }

    const website = await Website.findById(id).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Upload files to Supabase
    let sourceCodeData, docsData, videoData, previewVideoData;

    try {
      // Upload source code (required)
      sourceCodeData = await supabaseService.uploadSourceCode(files.sourceCode[0]);

      // Upload docs (required)
      docsData = await supabaseService.uploadDocs(files.docs[0]);

      // Upload video (optional)
      if (files.video && files.video[0]) {
        videoData = await supabaseService.uploadVideo(files.video[0]);
      }

      // Upload preview video (optional)
      if (files.previewVideo && files.previewVideo[0]) {
        previewVideoData = await supabaseService.uploadPreviewVideo(files.previewVideo[0]);
      }
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Error uploading files to storage',
        error: uploadError.message,
      });
    }

    // Update website with file details
    website.sourceCodeUrl = sourceCodeData.path;
    website.docsUrl = docsData.path;
    if (videoData) {
      website.videoUrl = videoData.path;
    }
    if (previewVideoData) {
      website.previewVideoUrl = previewVideoData.path;
    }

    // Update deployed link
    website.deployedUrl = deployedLink;

    website.files = {
      sourceCode: sourceCodeData,
      docs: docsData,
      ...(videoData && { video: videoData }),
      ...(previewVideoData && { previewVideo: previewVideoData }),
    };

    website.status = WEBSITE_STATUS.APPROVED;
    website.adminComment = undefined;

    await website.save();

    // Send email to seller
    try {
      await emailService.sendStatusUpdateEmail(
        website.sellerId,
        website,
        WEBSITE_STATUS.APPROVED
      );
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({
      success: true,
      message: 'Website approved and files uploaded successfully',
      data: website,
    });
  } catch (error) {
    console.error('Approve website error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving website',
      error: error.message,
    });
  }
};

/**
 * @route   DELETE /api/admin/websites/:id
 * @desc    Hard delete website with cascade
 * @access  Admin only
 */
const deleteWebsite = async (req, res) => {
  try {
    const { id } = req.params;

    const website = await Website.findById(id);

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Delete files from Supabase
    try {
      await supabaseService.deleteWebsiteFiles(website);
    } catch (storageError) {
      console.error('Failed to delete files from storage:', storageError);
      // Continue with database deletion even if file deletion fails
    }

    // Cascade delete
    await Promise.all([
      // Delete website
      Website.findByIdAndDelete(id),
      // Delete incomplete purchases
      Purchase.deleteMany({ websiteId: id, paymentStatus: { $ne: 'completed' } }),
      // Delete wishlists
      Wishlist.deleteMany({ websiteId: id }),
      // Delete download logs
      DownloadLog.deleteMany({ websiteId: id }),
    ]);

    res.json({
      success: true,
      message: 'Website and all associated data deleted successfully',
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

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get admin dashboard statistics
 * @access  Admin only
 */
const getDashboard = async (req, res) => {
  try {
    // Total users
    const totalUsers = await User.countDocuments({ role: 'user' });

    // Total websites by status
    const websiteStats = await Website.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Total revenue (platform fee + tax) with detailed breakdown
    const revenueData = await Purchase.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: null,
          totalPlatformFees: { $sum: '$platformFee' },
          totalTaxCollected: { $sum: '$tax' },
          totalSellerPayments: { $sum: '$sellerPrice' },
          totalGrossRevenue: { $sum: '$totalPaid' },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const revenue = revenueData.length > 0 ? revenueData[0] : {
      totalPlatformFees: 0,
      totalTaxCollected: 0,
      totalSellerPayments: 0,
      totalGrossRevenue: 0,
      totalTransactions: 0,
    };

    // Pending payouts
    const pendingPayoutsData = await Payout.aggregate([
      { $match: { status: PAYOUT_STATUS.PENDING } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const pendingPayouts = pendingPayoutsData.length > 0 ? pendingPayoutsData[0] : {
      totalAmount: 0,
      count: 0,
    };

    // Recent activity
    const recentPurchases = await Purchase.find({ paymentStatus: 'completed' })
      .populate('websiteId', 'name')
      .populate('buyerId', 'email')
      .sort({ purchaseDate: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
        },
        websites: websiteStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        revenue: {
          // What YOU (admin/platform owner) earn
          platformFees: revenue.totalPlatformFees,           // Your direct earnings
          taxCollected: revenue.totalTaxCollected,           // Tax collected (pay to govt)
          totalAdminRevenue: revenue.totalPlatformFees + revenue.totalTaxCollected, // Total you receive
          
          // What goes to sellers
          totalSellerPayments: revenue.totalSellerPayments,  // Total you must pay sellers
          
          // Overall metrics
          totalGrossRevenue: revenue.totalGrossRevenue,      // Total money collected
          totalTransactions: revenue.totalTransactions,
          
          // Net profit (after paying sellers and tax)
          netProfit: revenue.totalPlatformFees,              // Your profit after all payments
        },
        pendingPayouts: {
          amount: pendingPayouts.totalAmount,
          count: pendingPayouts.count,
        },
        recentActivity: recentPurchases,
      },
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/admin/payouts/pending
 * @desc    Get pending payouts
 * @access  Admin only
 */
const getPendingPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const payouts = await Payout.find({ status: PAYOUT_STATUS.PENDING })
      .populate('sellerId', 'email')
      .populate('websiteId', 'name category')
      .sort({ createdAt: 1 })
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
 * @route   POST /api/admin/payouts/:id/process
 * @desc    Process a payout
 * @access  Admin only
 */
const processPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { utr, transactionDate, adminNotes } = req.body;

    if (!utr) {
      return res.status(400).json({
        success: false,
        message: 'UTR (Unique Transaction Reference) is required',
      });
    }

    const payout = await Payout.findById(id).populate('sellerId');

    if (!payout) {
      return res.status(404).json({
        success: false,
        message: 'Payout not found',
      });
    }

    if (payout.status !== PAYOUT_STATUS.PENDING) {
      return res.status(400).json({
        success: false,
        message: 'Only pending payouts can be processed',
      });
    }

    // Update payout
    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.utr = utr;
    payout.transactionDate = transactionDate || new Date();
    payout.processedBy = req.userId;
    payout.processedAt = new Date();
    if (adminNotes) {
      payout.adminNotes = adminNotes;
    }

    await payout.save();

    // Send email to seller
    try {
      await emailService.sendPayoutNotification(payout.sellerId, payout);
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
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

module.exports = {
  getPendingWebsites,
  requestChanges,
  rejectWebsite,
  approveWebsite,
  deleteWebsite,
  getDashboard,
  getPendingPayouts,
  processPayout,
};