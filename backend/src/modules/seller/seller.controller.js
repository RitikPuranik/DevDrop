const Website = require('../website/website.model');
const BankDetails = require('../user/bankDetails.model');
const Purchase = require('../payment/purchase.model');
const Payout = require('../payout/payout.model');
const { WEBSITE_STATUS, WEBSITE_CATEGORIES } = require('../../shared/utils/constants');
const { getPaginationMetadata } = require('../../shared/utils/helpers');

const submitWebsite = async (req, res) => {
  try {
    const { name, description, techStack, category, price, deployedUrl, githubUrl } = req.body;
    const sellerId = req.userId;

    if (!Object.values(WEBSITE_CATEGORIES).includes(category))
      return res.status(400).json({ success: false, message: 'Invalid category' });

    if (category === WEBSITE_CATEGORIES.FREE && price !== 0)
      return res.status(400).json({ success: false, message: 'Free websites must have price 0' });

    if ((category === WEBSITE_CATEGORIES.PAID || category === WEBSITE_CATEGORIES.EXCLUSIVE) && price <= 0)
      return res.status(400).json({ success: false, message: 'Paid/exclusive websites must have price > 0' });

    if (category !== WEBSITE_CATEGORIES.FREE) {
      const bankDetails = await BankDetails.findOne({ userId: sellerId });
      if (!bankDetails) return res.status(400).json({ success: false, message: 'Please add your bank details before listing a paid website', requiresBankDetails: true });
    }

    const website = new Website({ name, description, techStack: techStack || {}, category, price, deployedUrl, githubUrl, sellerId, status: WEBSITE_STATUS.PENDING_REVIEW });
    await website.save();

    res.status(201).json({ success: true, message: 'Website submitted for review', data: website });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error submitting website', error: error.message });
  }
};

const getMyWebsites = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { sellerId: req.userId, isDeleted: false };
    if (status) query.status = status;

    const [websites, total] = await Promise.all([
      Website.find(query).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Website.countDocuments(query),
    ]);

    // Batch-count sales for all websites in one aggregation — avoids N+1 queries
    const websiteIds = websites.map(w => w._id);
    const salesCounts = await Purchase.aggregate([
      { $match: { websiteId: { $in: websiteIds }, paymentStatus: 'completed' } },
      { $group: { _id: '$websiteId', count: { $sum: 1 } } },
    ]);
    const salesMap = {};
    salesCounts.forEach(s => { salesMap[s._id.toString()] = s.count; });

    const websitesWithStats = websites.map(w => ({
      ...w,
      salesCount: salesMap[w._id.toString()] || 0,
    }));

    res.json({ success: true, data: websitesWithStats, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching websites', error: error.message });
  }
};

const updateWebsite = async (req, res) => {
  try {
    const website = await Website.findOne({ _id: req.params.id, sellerId: req.userId, isDeleted: false });
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });
    if (website.status !== WEBSITE_STATUS.CHANGES_REQUESTED)
      return res.status(400).json({ success: false, message: 'You can only update websites with changes requested' });

    const { name, description, techStack, price, deployedUrl, githubUrl } = req.body;
    if (name) website.name = name;
    if (description) website.description = description;
    if (techStack) website.techStack = { ...website.techStack, ...techStack };
    if (price !== undefined) {
      if (website.category === WEBSITE_CATEGORIES.FREE && price !== 0) return res.status(400).json({ success: false, message: 'Free websites must have price 0' });
      website.price = price;
    }
    if (deployedUrl) website.deployedUrl = deployedUrl;
    if (githubUrl !== undefined) website.githubUrl = githubUrl;

    website.status = WEBSITE_STATUS.PENDING_REVIEW;
    website.adminComment = undefined;
    await website.save();

    res.json({ success: true, message: 'Website updated and resubmitted for review', data: website });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating website', error: error.message });
  }
};

const getEarnings = async (req, res) => {
  try {
    const sellerId = req.userId;

    const [earningsData, pendingPayouts, completedPayouts, recentSales] = await Promise.all([
      Purchase.aggregate([{ $match: { sellerId, paymentStatus: 'completed' } }, { $group: { _id: null, totalEarnings: { $sum: '$sellerPrice' }, totalSales: { $sum: 1 } } }]),
      Payout.aggregate([{ $match: { sellerId, status: 'pending' } }, { $group: { _id: null, pendingAmount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Payout.aggregate([{ $match: { sellerId, status: 'completed' } }, { $group: { _id: null, paidAmount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Purchase.find({ sellerId, paymentStatus: 'completed' }).populate('websiteId', 'name category').populate('buyerId', 'email').sort({ purchaseDate: -1 }).limit(10),
    ]);

    res.json({
      success: true,
      data: {
        totalEarnings: earningsData[0]?.totalEarnings || 0,
        totalSales: earningsData[0]?.totalSales || 0,
        pendingPayouts: { amount: pendingPayouts[0]?.pendingAmount || 0, count: pendingPayouts[0]?.count || 0 },
        completedPayouts: { amount: completedPayouts[0]?.paidAmount || 0, count: completedPayouts[0]?.count || 0 },
        recentSales,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching earnings', error: error.message });
  }
};

const getPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { sellerId: req.userId };
    if (status) query.status = status;

    const payouts = await Payout.find(query).populate('websiteId', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Payout.countDocuments(query);

    res.json({ success: true, data: payouts, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching payouts', error: error.message });
  }
};

const deleteOwnWebsite = async (req, res) => {
  try {
    const website = await Website.findOne({ _id: req.params.id, sellerId: req.userId, isDeleted: false });
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });
    if ([WEBSITE_STATUS.APPROVED, WEBSITE_STATUS.SOLD].includes(website.status))
      return res.status(400).json({ success: false, message: 'Cannot delete approved or sold websites. Please contact admin.' });

    website.isDeleted = true;
    website.deletedAt = new Date();
    await website.save();

    res.json({ success: true, message: 'Website deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting website', error: error.message });
  }
};

module.exports = { submitWebsite, getMyWebsites, updateWebsite, getEarnings, getPayouts, deleteOwnWebsite };
