const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const User = require('../user/user.model');
const { WEBSITE_STATUS, PAYMENT_STATUS } = require('../../shared/utils/constants');
const emailService = require('../../services/email.service');
const { getPaginationMetadata } = require('../../shared/utils/helpers');
const supabaseService = require('../../services/supabase.service');

const getPublicAssetUrl = (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  return supabaseService.getPublicUrl(filePath);
};

const getPreviewVideoAccessUrl = async (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  return supabaseService.createSignedUrl(filePath, 7200);
};

const purchaseWebsitePopulate = {
  path: 'websiteId',
  select: 'name description techStack category price deployedUrl previewUrl files previewVideoUrl sellerId',
  populate: {
    path: 'sellerId',
    select: 'name email',
  },
};

const hydratePurchaseWebsite = async (purchaseDoc) => {
  const purchase = purchaseDoc.toObject();
  const website = purchase.websiteId;

  if (website?.previewVideoUrl) {
    website.files = website.files || {};
    website.files.previewVideo = {
      ...(website.files.previewVideo || {}),
      url: await getPreviewVideoAccessUrl(website.previewVideoUrl),
    };
  }

  return purchase;
};

const purchaseFreeWebsite = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const buyerId = req.userId;

    const website = await Website.findOne({ _id: websiteId, isDeleted: false }).populate('sellerId');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });
    if (website.status !== WEBSITE_STATUS.APPROVED) return res.status(400).json({ success: false, message: 'This website is not available' });
    if (website.category !== 'free') return res.status(400).json({ success: false, message: 'Not a free website. Use payment flow.' });

    const existingPurchase = await Purchase.findOne({ websiteId, buyerId });
    if (existingPurchase) return res.status(400).json({ success: false, message: 'You have already purchased this website' });

    const purchase = new Purchase({ websiteId, buyerId, sellerId: website.sellerId._id, category: website.category, sellerPrice: 0, platformFee: 0, tax: 0, totalPaid: 0, paymentStatus: PAYMENT_STATUS.COMPLETED, purchaseDate: new Date() });
    await purchase.save();

    const buyer = await User.findById(buyerId);
    try {
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    } catch (e) { console.error('Email error:', e); }

    res.status(201).json({ success: true, message: 'Website purchased successfully', data: { purchase, website: { id: website._id, name: website.name, category: website.category } } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing purchase', error: error.message });
  }
};

const checkPurchase = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({ websiteId: req.params.websiteId, buyerId: req.userId, paymentStatus: PAYMENT_STATUS.COMPLETED });
    res.json({ success: true, data: { hasPurchased: !!purchase, purchase: purchase || null } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error checking purchase', error: error.message });
  }
};

const getMyPurchases = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const purchases = await Purchase.find({ buyerId: req.userId, paymentStatus: PAYMENT_STATUS.COMPLETED })
      .populate(purchaseWebsitePopulate)
      .populate('sellerId', 'name email')
      .sort({ purchaseDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Purchase.countDocuments({ buyerId: req.userId, paymentStatus: PAYMENT_STATUS.COMPLETED });
    res.json({
      success: true,
      data: await Promise.all(purchases.map(hydratePurchaseWebsite)),
      pagination: { currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalItems: total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching purchases', error: error.message });
  }
};

const getPurchaseDetails = async (req, res) => {
  try {
    const purchase = await Purchase.findOne({
      _id: req.params.purchaseId,
      buyerId: req.userId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    })
      .populate(purchaseWebsitePopulate)
      .populate('sellerId', 'name email');

    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    res.json({
      success: true,
      data: await hydratePurchaseWebsite(purchase),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching purchase details', error: error.message });
  }
};

module.exports = { purchaseFreeWebsite, checkPurchase, getMyPurchases, getPurchaseDetails };
