const Website = require('./website.model');
const Wishlist = require('../wishlist/wishlist.model');
const supabaseService = require('../../services/supabase.service');
const { getPaginationMetadata } = require('../../shared/utils/helpers');
const { PAGINATION, WEBSITE_STATUS } = require('../../shared/utils/constants');

const getPublicAssetUrl = (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//.test(filePath)) return filePath;
  return supabaseService.getPublicUrl(filePath);
};

const hydrateWebsitePreviewsAsync = async (websites) => {
  const result = websites.map(w => (w.toObject ? w.toObject() : w));
  
  // Find all websites that have a previewVideoUrl that needs signing
  const pathsToSign = [];
  result.forEach(w => {
    if (w.previewVideoUrl && !/^https?:\/\//.test(w.previewVideoUrl)) {
      pathsToSign.push(w.previewVideoUrl);
    }
  });

  if (pathsToSign.length > 0) {
    try {
      // Create signed URLs valid for 2 hours
      const signedUrls = await supabaseService.createSignedUrls(pathsToSign, 7200);
      const urlMap = {};
      signedUrls.forEach(item => {
        if (!item.error) urlMap[item.path] = item.signedUrl;
      });

      result.forEach(w => {
        if (w.previewVideoUrl && urlMap[w.previewVideoUrl]) {
          w.files = w.files || {};
          w.files.previewVideo = {
            ...(w.files.previewVideo || {}),
            url: urlMap[w.previewVideoUrl],
          };
        } else if (w.previewVideoUrl && /^https?:\/\//.test(w.previewVideoUrl)) {
          w.files = w.files || {};
          w.files.previewVideo = { ...(w.files.previewVideo || {}), url: w.previewVideoUrl };
        }
      });
    } catch (err) {
      console.error('Failed to generate signed URLs for previews:', err);
    }
  } else {
    // Just map external URLs
    result.forEach(w => {
      if (w.previewVideoUrl && /^https?:\/\//.test(w.previewVideoUrl)) {
        w.files = w.files || {};
        w.files.previewVideo = { ...(w.files.previewVideo || {}), url: w.previewVideoUrl };
      }
    });
  }
  
  result.forEach(w => {
    if (w.sellerId && w.sellerId.avatar) {
      w.sellerId.avatar = getPublicAssetUrl(w.sellerId.avatar);
    }
  });

  return result;
};

const browseWebsites = async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, category, minPrice, maxPrice, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const query = { status: { $in: [WEBSITE_STATUS.APPROVED, WEBSITE_STATUS.IN_AUCTION] }, isDeleted: false, $or: [{ category: { $ne: 'exclusive' } }, { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } }] };
    if (category) query.category = category;
    if (minPrice || maxPrice) { query.price = {}; if (minPrice) query.price.$gte = parseFloat(minPrice); if (maxPrice) query.price.$lte = parseFloat(maxPrice); }

    // Run find + count in parallel — saves one full DB round trip
    const [websites, total] = await Promise.all([
      Website.find(query).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar').sort({ [sortBy]: order === 'asc' ? 1 : -1 }).skip(skip).limit(parseInt(limit)),
      Website.countDocuments(query),
    ]);

    let result = await hydrateWebsitePreviewsAsync(websites);

    if (req.userId) {
      const wishlistSet = new Set((await Wishlist.find({ userId: req.userId, websiteId: { $in: websites.map(w => w._id) } })).map(w => w.websiteId.toString()));
      result = result.map(w => ({ ...w, isWishlisted: wishlistSet.has(w._id.toString()) }));
    }

    res.json({ success: true, data: result, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching websites', error: error.message });
  }
};

const getWebsiteDetails = async (req, res) => {
  try {
    const website = await Website.findOne({ 
      _id: req.params.id, 
      status: { $in: [WEBSITE_STATUS.APPROVED, WEBSITE_STATUS.SOLD, WEBSITE_STATUS.IN_AUCTION] }, 
      isDeleted: false 
    }).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    if (website.category === 'exclusive' && website.status === WEBSITE_STATUS.SOLD) {
      return res.status(404).json({ success: false, message: 'Website not found' });
    }

    // Fire-and-forget — don't await, it shouldn't delay the response
    Website.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec().catch(() => {});

    let isWishlisted = false;
    if (req.userId) { isWishlisted = !!(await Wishlist.findOne({ userId: req.userId, websiteId: req.params.id })); }

    const hydrated = await hydrateWebsitePreviewsAsync([website]);
    const data = { ...hydrated[0], isWishlisted };

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching website', error: error.message });
  }
};

const getByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;
    if (!['free', 'paid', 'exclusive'].includes(category)) return res.status(400).json({ success: false, message: 'Invalid category' });

    const skip = (page - 1) * limit;
    const query = { category, status: { $in: [WEBSITE_STATUS.APPROVED, WEBSITE_STATUS.IN_AUCTION] }, isDeleted: false };
    if (category === 'exclusive') query.status = { $ne: WEBSITE_STATUS.SOLD };

    const [websites, total] = await Promise.all([
      Website.find(query).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Website.countDocuments(query),
    ]);

    const result = await hydrateWebsitePreviewsAsync(websites);
    res.json({ success: true, data: result, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching category', error: error.message });
  }
};

const searchWebsites = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Search query is required' });

    const skip = (page - 1) * limit;
    const query = {
      $text: { $search: q },
      status: { $in: [WEBSITE_STATUS.APPROVED, WEBSITE_STATUS.IN_AUCTION] },
      isDeleted: false,
      $or: [{ category: { $ne: 'exclusive' } }, { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } }]
    };

    const [websites, total] = await Promise.all([
      Website.find(query).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar').sort({ score: { $meta: 'textScore' } }).skip(skip).limit(parseInt(limit)),
      Website.countDocuments(query),
    ]);

    const result = await hydrateWebsitePreviewsAsync(websites);
    res.json({ success: true, data: result, pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total), searchQuery: q });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error searching websites', error: error.message });
  }
};

module.exports = { browseWebsites, getWebsiteDetails, getByCategory, searchWebsites };
