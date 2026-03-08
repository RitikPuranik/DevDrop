const User     = require('../modules/user/user.model');
const Website  = require('../modules/website/website.model');
const Purchase = require('../modules/payment/purchase.model');
const Payout   = require('../modules/payout/payout.model');
const Payment  = require('../modules/payment/payment.model');
const { WEBSITE_STATUS, PAYMENT_STATUS } = require('../shared/utils/constants');

const getPlatformStats = async () => {
  const [totalUsers, totalWebsites, totalPurchases, revenueData] = await Promise.all([
    User.countDocuments(),
    Website.countDocuments({ isDeleted: false }),
    Purchase.countDocuments({ paymentStatus: PAYMENT_STATUS.COMPLETED }),
    Purchase.aggregate([
      { $match: { paymentStatus: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalPaid' }, totalPlatformFee: { $sum: '$platformFee' }, totalTax: { $sum: '$tax' } } },
    ]),
  ]);

  return {
    totalUsers,
    totalWebsites,
    totalPurchases,
    totalRevenue: revenueData[0]?.totalRevenue || 0,
    totalPlatformFee: revenueData[0]?.totalPlatformFee || 0,
    totalTax: revenueData[0]?.totalTax || 0,
  };
};

const getWebsiteStats = async () => {
  const byStatus = await Website.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byCategory = await Website.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);

  return { byStatus, byCategory };
};

const getSalesStats = async (period = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  const sales = await Purchase.aggregate([
    { $match: { paymentStatus: PAYMENT_STATUS.COMPLETED, purchaseDate: { $gte: startDate } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } }, count: { $sum: 1 }, revenue: { $sum: '$totalPaid' } } },
    { $sort: { _id: 1 } },
  ]);

  return sales;
};

module.exports = { getPlatformStats, getWebsiteStats, getSalesStats };
