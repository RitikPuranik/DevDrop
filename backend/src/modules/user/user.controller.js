const User = require('./user.model');
const BankDetails = require('./bankDetails.model');
const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const Payout = require('../payout/payout.model');
const Wishlist = require('../wishlist/wishlist.model');
const supabaseService = require('../../services/supabase.service');

const getPublicAssetUrl = async (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  try {
    return await supabaseService.createSignedUrl(filePath, 7200);
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
};

const hydratePurchaseWebsite = async (purchaseDoc) => {
  const purchase = purchaseDoc.toObject();
  const website = purchase.websiteId;

  if (website?.previewVideoUrl) {
    website.files = website.files || {};
    website.files.previewVideo = {
      ...(website.files.previewVideo || {}),
      url: await getPublicAssetUrl(website.previewVideoUrl),
    };
  }

  if (website?.sellerId?.avatar) {
    website.sellerId.avatar = await getPublicAssetUrl(website.sellerId.avatar);
  }
  if (purchase.sellerId && purchase.sellerId.avatar) {
    purchase.sellerId.avatar = await getPublicAssetUrl(purchase.sellerId.avatar);
  }

  return purchase;
};

const getProfile = async (req, res) => {
  try {
    const bankDetails = await BankDetails.findOne({ userId: req.user._id });
    const avatarUrl = await getPublicAssetUrl(req.user.avatar);
    res.json({ success: true, data: { user: { id: req.user._id, name: req.user.name, phone: req.user.phone, email: req.user.email, role: req.user.role, isVerified: req.user.isVerified, avatar: avatarUrl, createdAt: req.user.createdAt }, hasBankDetails: !!bankDetails } });
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
    res.json({ success: true, data: bankDetails || null });
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
      data: await Promise.all(purchases.map(hydratePurchaseWebsite)),
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalItems: total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching purchases', error: error.message });
  }
};

const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Delete old avatar from Supabase if it's a Supabase path (not an external URL)
    if (user.avatar) {
      await supabaseService.deleteAvatar(user.avatar);
    }

    // Upload new avatar
    const uploadResult = await supabaseService.uploadAvatar(req.file);

    // Save the Supabase storage path (not the public URL) so we can delete it later
    user.avatar = uploadResult.path;
    await user.save();

    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: { avatar: uploadResult.publicUrl },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating profile picture', error: error.message });
  }
};

const removeProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Delete avatar from Supabase if it's a stored path
    if (user.avatar) {
      await supabaseService.deleteAvatar(user.avatar);
    }

    user.avatar = undefined;
    await user.save();

    res.json({ success: true, message: 'Profile picture removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error removing profile picture', error: error.message });
  }
};

module.exports = { getProfile, saveBankDetails, getBankDetails, getDashboard, getPurchases, updateProfilePicture, removeProfilePicture };
