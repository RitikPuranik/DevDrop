const User = require('../models/User');
const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payout = require('../models/Payout');
const DownloadLog = require('../models/DownloadLog');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../utils/constants');

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (startDate, endDate) => {
  try {
    const matchQuery = {
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    };

    if (startDate && endDate) {
      matchQuery.purchaseDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const revenueData = await Purchase.aggregate([
      { $match: matchQuery },
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

    // Get revenue by category
    const categoryRevenue = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$category',
          revenue: { $sum: '$totalPaid' },
          transactions: { $sum: 1 },
          avgPrice: { $avg: '$sellerPrice' },
        },
      },
    ]);

    // Get revenue by month (last 12 months)
    const monthlyRevenue = await Purchase.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.COMPLETED } },
      {
        $group: {
          _id: {
            year: { $year: '$purchaseDate' },
            month: { $month: '$purchaseDate' },
          },
          revenue: { $sum: '$totalPaid' },
          platformFees: { $sum: '$platformFee' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    return {
      overall: revenueData.length > 0 ? revenueData[0] : {
        totalPlatformFees: 0,
        totalTaxCollected: 0,
        totalSellerPayments: 0,
        totalGrossRevenue: 0,
        totalTransactions: 0,
      },
      byCategory: categoryRevenue,
      byMonth: monthlyRevenue,
    };
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    throw error;
  }
};

/**
 * Get sales analytics
 */
const getSalesAnalytics = async (startDate, endDate) => {
  try {
    const matchQuery = {
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    };

    if (startDate && endDate) {
      matchQuery.purchaseDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // Top selling websites
    const topWebsites = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$websiteId',
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$totalPaid' },
        },
      },
      { $sort: { totalSales: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'websites',
          localField: '_id',
          foreignField: '_id',
          as: 'website',
        },
      },
      { $unwind: '$website' },
      {
        $project: {
          websiteId: '$_id',
          websiteName: '$website.name',
          category: '$website.category',
          totalSales: 1,
          totalRevenue: 1,
        },
      },
    ]);

    // Top sellers
    const topSellers = await Purchase.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$sellerId',
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$sellerPrice' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'seller',
        },
      },
      { $unwind: '$seller' },
      {
        $project: {
          sellerId: '$_id',
          sellerName: '$seller.name',
          sellerEmail: '$seller.email',
          totalSales: 1,
          totalRevenue: 1,
        },
      },
    ]);

    // Sales by day (last 30 days)
    const dailySales = await Purchase.aggregate([
      {
        $match: {
          paymentStatus: PAYMENT_STATUS.COMPLETED,
          purchaseDate: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$purchaseDate' },
            month: { $month: '$purchaseDate' },
            day: { $dayOfMonth: '$purchaseDate' },
          },
          sales: { $sum: 1 },
          revenue: { $sum: '$totalPaid' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);

    return {
      topWebsites,
      topSellers,
      dailySales,
    };
  } catch (error) {
    console.error('Get sales analytics error:', error);
    throw error;
  }
};

/**
 * Get user analytics
 */
const getUserAnalytics = async () => {
  try {
    // Total users by role
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]);

    // Verified vs unverified
    const verificationStatus = await User.aggregate([
      {
        $group: {
          _id: '$isVerified',
          count: { $sum: 1 },
        },
      },
    ]);

    // New users by month (last 12 months)
    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          newUsers: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    // Active users (made purchase or listed website)
    const activeBuyers = await Purchase.distinct('buyerId');
    const activeSellers = await Website.distinct('sellerId');

    return {
      byRole: usersByRole,
      verificationStatus,
      growth: userGrowth,
      activeBuyers: activeBuyers.length,
      activeSellers: activeSellers.length,
    };
  } catch (error) {
    console.error('Get user analytics error:', error);
    throw error;
  }
};

/**
 * Get website analytics
 */
const getWebsiteAnalytics = async () => {
  try {
    // Websites by status
    const websitesByStatus = await Website.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Websites by category
    const websitesByCategory = await Website.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' },
          totalViews: { $sum: '$viewCount' },
        },
      },
    ]);

    // Most viewed websites
    const mostViewed = await Website.find({ isDeleted: false })
      .sort({ viewCount: -1 })
      .limit(10)
      .select('name category viewCount price');

    // Most wishlisted websites
    const mostWishlisted = await Website.find({ isDeleted: false })
      .sort({ wishlistCount: -1 })
      .limit(10)
      .select('name category wishlistCount price');

    // Average time to approve (pending_review to approved)
    const approvalTimes = await Website.aggregate([
      {
        $match: {
          status: WEBSITE_STATUS.APPROVED,
          updatedAt: { $exists: true },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          approvalTime: {
            $subtract: ['$updatedAt', '$createdAt'],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgApprovalTime: { $avg: '$approvalTime' },
          minApprovalTime: { $min: '$approvalTime' },
          maxApprovalTime: { $max: '$approvalTime' },
        },
      },
    ]);

    return {
      byStatus: websitesByStatus,
      byCategory: websitesByCategory,
      mostViewed,
      mostWishlisted,
      approvalMetrics: approvalTimes.length > 0 ? approvalTimes[0] : null,
    };
  } catch (error) {
    console.error('Get website analytics error:', error);
    throw error;
  }
};

/**
 * Get payout analytics
 */
const getPayoutAnalytics = async () => {
  try {
    // Payouts by status
    const payoutsByStatus = await Payout.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    // Average payout processing time
    const processingTimes = await Payout.aggregate([
      {
        $match: {
          status: PAYOUT_STATUS.COMPLETED,
          processedAt: { $exists: true },
          createdAt: { $exists: true },
        },
      },
      {
        $project: {
          processingTime: {
            $subtract: ['$processedAt', '$createdAt'],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgProcessingTime: { $avg: '$processingTime' },
          minProcessingTime: { $min: '$processingTime' },
          maxProcessingTime: { $max: '$processingTime' },
        },
      },
    ]);

    // Payouts by month
    const monthlyPayouts = await Payout.aggregate([
      {
        $match: {
          status: PAYOUT_STATUS.COMPLETED,
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$processedAt' },
            month: { $month: '$processedAt' },
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 },
    ]);

    return {
      byStatus: payoutsByStatus,
      processingMetrics: processingTimes.length > 0 ? processingTimes[0] : null,
      monthly: monthlyPayouts,
    };
  } catch (error) {
    console.error('Get payout analytics error:', error);
    throw error;
  }
};

/**
 * Get download analytics
 */
const getDownloadAnalytics = async () => {
  try {
    // Total downloads
    const totalDownloads = await DownloadLog.countDocuments();

    // Downloads by file type
    const downloadsByType = await DownloadLog.aggregate([
      {
        $group: {
          _id: '$fileType',
          count: { $sum: 1 },
        },
      },
    ]);

    // Most downloaded websites
    const mostDownloaded = await DownloadLog.aggregate([
      {
        $group: {
          _id: '$websiteId',
          downloadCount: { $sum: 1 },
        },
      },
      { $sort: { downloadCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'websites',
          localField: '_id',
          foreignField: '_id',
          as: 'website',
        },
      },
      { $unwind: '$website' },
      {
        $project: {
          websiteId: '$_id',
          websiteName: '$website.name',
          category: '$website.category',
          downloadCount: 1,
        },
      },
    ]);

    // Suspicious downloads (flagged)
    const suspiciousDownloads = await DownloadLog.countDocuments({
      suspicious: true,
    });

    return {
      totalDownloads,
      byFileType: downloadsByType,
      mostDownloaded,
      suspiciousCount: suspiciousDownloads,
    };
  } catch (error) {
    console.error('Get download analytics error:', error);
    throw error;
  }
};

/**
 * Get complete dashboard analytics
 */
const getDashboardAnalytics = async (period = 'all') => {
  try {
    let startDate, endDate;

    // Calculate date range based on period
    if (period !== 'all') {
      endDate = new Date();
      switch (period) {
        case 'today':
          startDate = new Date(endDate.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(endDate.setDate(endDate.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(endDate.setMonth(endDate.getMonth() - 1));
          break;
        case 'year':
          startDate = new Date(endDate.setFullYear(endDate.getFullYear() - 1));
          break;
        default:
          startDate = null;
          endDate = null;
      }
    }

    const [revenue, sales, users, websites, payouts, downloads] = await Promise.all([
      getRevenueAnalytics(startDate, endDate),
      getSalesAnalytics(startDate, endDate),
      getUserAnalytics(),
      getWebsiteAnalytics(),
      getPayoutAnalytics(),
      getDownloadAnalytics(),
    ]);

    return {
      period,
      revenue,
      sales,
      users,
      websites,
      payouts,
      downloads,
      generatedAt: new Date(),
    };
  } catch (error) {
    console.error('Get dashboard analytics error:', error);
    throw error;
  }
};

module.exports = {
  getRevenueAnalytics,
  getSalesAnalytics,
  getUserAnalytics,
  getWebsiteAnalytics,
  getPayoutAnalytics,
  getDownloadAnalytics,
  getDashboardAnalytics,
};