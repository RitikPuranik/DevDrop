const User = require('./user.model');
const BankDetails = require('./bankDetails.model');
const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const Payout = require('../payout/payout.model');
const Wishlist = require('../wishlist/wishlist.model');
const supabaseService = require('../../services/supabase.service');

const getPublicAssetUrl = (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  return supabaseService.getPublicUrl(filePath);
};

const hydratePurchaseWebsite = (purchaseDoc) => {
  const purchase = purchaseDoc.toObject();
  const website = purchase.websiteId;

  if (website?.previewVideoUrl) {
    website.files = website.files || {};
    website.files.previewVideo = {
      ...(website.files.previewVideo || {}),
      url: getPublicAssetUrl(website.previewVideoUrl),
    };
  }

  return purchase;
};

const getProfile = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.user._id });
    res.json({ success: true, data: { user: { id: req.user._id, name: req.user.name, phone: req.user.phone, email: req.user.email, role: req.user.role, isVerified: req.user.isVerified, createdAt: req.user.createdAt }, hasBankDetails: !!bankDetails } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching profile', error: error.message });
  }
};

const saveBankDetails = async (req, res) => {
  try {
    const userId = req.userId;
    const { upiId, phoneNumber } = req.body;

    let bankDetails = await BankDetails.findOne({ userId });

    if (bankDetails) {
      bankDetails.upiId = upiId;
      bankDetails.phoneNumber = phoneNumber;
      await bankDetails.save();
      return res.json({ success: true, message: 'Payout details updated successfully', data: bankDetails });
    }

    bankDetails = new BankDetails({ userId, upiId, phoneNumber });
    await bankDetails.save();
    res.status(201).json({ success: true, message: 'Payout details saved successfully', data: bankDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error saving bank details', error: error.message });
  }
};

const getBankDetails = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.userId });
    if (!bankDetails) return res.status(404).json({ success: false, message: 'Bank details not found' });
    res.json({ success: true, data: bankDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching bank details', error: error.message });
  }
};

const getDashboard = async (req, res) => {
  try {
    const userId = req.userId;
    const [uploadedWebsites, purchases, wishlistCount, earnings, pendingPayouts] = await Promise.all([
      Website.countDocuments({ sellerId: userId, status: 'approved', isDeleted: false }),
      Purchase.countDocuments({ buyerId: userId, paymentStatus: 'completed' }),
      Wishlist.countDocuments({ userId }),
      Purchase.aggregate([{ $match: { sellerId: userId, paymentStatus: 'completed' } }, { $group: { _id: null, total: { $sum: '$sellerPrice' } } }]),
      Payout.countDocuments({ sellerId: userId, status: 'pending' }),
    ]);

    res.json({ success: true, data: { uploadedWebsites, purchases, wishlistCount, totalEarnings: earnings[0]?.total || 0, pendingPayouts } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching dashboard data', error: error.message });
  }
};

const getPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const purchases = await Purchase.find({ buyerId: req.userId, paymentStatus: 'completed' })
      .populate({
        path: 'websiteId',
        select: 'name description techStack category price deployedUrl previewUrl files previewVideoUrl sellerId',
        populate: {
          path: 'sellerId',
          select: 'name email',
        },
      })
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Purchase.countDocuments({ buyerId: req.userId, paymentStatus: 'completed' });

    res.json({
      success: true,
      data: purchases.map(hydratePurchaseWebsite),
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalItems: total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching purchases', error: error.message });
  }
};

module.exports = { getProfile, saveBankDetails, getBankDetails, getDashboard, getPurchases };
