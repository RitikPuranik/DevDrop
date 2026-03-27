const Website = require('./website.model');
const Wishlist = require('../wishlist/wishlist.model');
const { getPaginationMetadata } = require('../../shared/utils/helpers');
const { PAGINATION, WEBSITE_STATUS } = require('../../shared/utils/constants');

const browseWebsites = async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, category, minPrice, maxPrice, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const query = { status: WEBSITE_STATUS.APPROVED, isDeleted: false, $or: [{ category: { $ne: 'exclusive' } }, { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } }] };
    if (category) query.category = category;
    if (minPrice || maxPrice) { query.price = {}; if (minPrice) query.price.$gte = parseFloat(minPrice); if (maxPrice) query.price.$lte = parseFloat(maxPrice); }

    const websites = await Website.find(query).select('-adminComment -files -isDeleted').populate('sellerId', 'email').sort({ [sortBy]: order === 'asc' ? 1 : -1 }).skip(skip).limit(parseInt(limit));
    const total = await Website.countDocuments(query);

    let result = websites;
    if (req.userId) {
      const wishlistSet = new Set((await Wishlist.find({ userId: req.userId, websiteId: { $in: websites.map(w => w._id) } })).map(w => w.websiteId.toString()));
      result = websites.map(w => ({ ...w.toObject(), isWishlisted: wishlistSet.has(w._id.toString()) }));
    }

    res.json({ success: true, data: result, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching websites', error: error.message });
  }
};

const getWebsiteDetails = async (req, res) => {
  try {
    const website = await Website.findOne({ _id: req.params.id, status: WEBSITE_STATUS.APPROVED, isDeleted: false }).select('-adminComment -isDeleted').populate('sellerId', 'email');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    await Website.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });

    let isWishlisted = false;
    if (req.userId) { isWishlisted = !!(await Wishlist.findOne({ userId: req.userId, websiteId: req.params.id })); }

    res.json({ success: true, data: { ...website.toObject(), isWishlisted } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching website', error: error.message });
  }
};

const getByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;
    if (!['free', 'paid', 'exclusive'].includes(category)) return res.status(400).json({ success: false, message: 'Invalid category' });

    const query = { category, status: WEBSITE_STATUS.APPROVED, isDeleted: false };
    if (category === 'exclusive') query.status = { $ne: WEBSITE_STATUS.SOLD };

    const websites = await Website.find(query).select('-adminComment -files -isDeleted').populate('sellerId', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Website.countDocuments(query);

    res.json({ success: true, data: websites, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching websites', error: error.message });
  }
};

const searchWebsites = async (req, res) => {
  try {
    const { q, page = 1, limit = 20, category } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });

    const query = {
      status: WEBSITE_STATUS.APPROVED, isDeleted: false,
      $or: [{ name: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }, { 'techStack.frontend': { $regex: q, $options: 'i' } }, { 'techStack.backend': { $regex: q, $options: 'i' } }, { 'techStack.database': { $regex: q, $options: 'i' } }],
      $and: [{ $or: [{ category: { $ne: 'exclusive' } }, { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } }] }],
    };
    if (category) query.category = category;

    const websites = await Website.find(query).select('-adminComment -files -isDeleted').populate('sellerId', 'email').sort({ viewCount: -1, createdAt: -1 }).skip((page - 1) * limit).limit(parseInt(limit));
    const total = await Website.countDocuments(query);

    res.json({ success: true, data: websites, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total), searchQuery: q });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error searching websites', error: error.message });
  }
};

module.exports = { browseWebsites, getWebsiteDetails, getByCategory, searchWebsites };
