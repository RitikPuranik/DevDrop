const Website = require('./website.model');
const Wishlist = require('../wishlist/wishlist.model');
const supabaseService = require('../../services/supabase.service');
const { getPaginationMetadata } = require('../../shared/utils/helpers');
const { PAGINATION, WEBSITE_STATUS } = require('../../shared/utils/constants');
const cache = require('../../infrastructure/cache');

// Public marketplace listings are identical for every visitor (the per-user wishlist flag is overlaid
// after the cache), so they are cached briefly. TTL stays below the 2h signed-URL lifetime.
const LISTING_TTL_SEC = Number.parseInt(process.env.CACHE_LISTING_TTL_SEC || '60', 10);
const cacheableListing = ({ page, limit, sortBy }) =>
  /^\d{1,4}$/.test(String(page)) && /^\d{1,2}$/.test(String(limit)) && /^[A-Za-z]{1,30}$/.test(String(sortBy || 'createdAt'));

const hydrateWebsitePreviewsAsync = async (websites) => {
  const result = websites.map(w => (w.toObject ? w.toObject() : w));
  
  const pathsToSign = [];
  result.forEach(w => {
    if (w.previewVideoUrl && !/^https?:\/\//.test(w.previewVideoUrl)) {
      pathsToSign.push(w.previewVideoUrl);
    }
    if (w.sellerId && w.sellerId.avatar && !/^https?:\/\//.test(w.sellerId.avatar)) {
      pathsToSign.push(w.sellerId.avatar);
    }
  });

  const urlMap = {};

  if (pathsToSign.length > 0) {
    try {
      const uniquePaths = [...new Set(pathsToSign)];
      const signedUrls = await supabaseService.createSignedUrls(uniquePaths, 7200);
      signedUrls.forEach(item => {
        if (!item.error) urlMap[item.path] = item.signedUrl;
      });
    } catch (err) {
      console.error('Failed to generate signed URLs:', err);
    }
  }

  result.forEach(w => {
    if (w.previewVideoUrl) {
      w.files = w.files || {};
      if (/^https?:\/\//.test(w.previewVideoUrl)) {
        w.files.previewVideo = { ...(w.files.previewVideo || {}), url: w.previewVideoUrl };
      } else if (urlMap[w.previewVideoUrl]) {
        w.files.previewVideo = { ...(w.files.previewVideo || {}), url: urlMap[w.previewVideoUrl] };
      }
    }

    if (w.sellerId && w.sellerId.avatar) {
      if (/^https?:\/\//.test(w.sellerId.avatar)) {
        // already an external url
      } else if (urlMap[w.sellerId.avatar]) {
        w.sellerId.avatar = urlMap[w.sellerId.avatar];
      } else {
        w.sellerId.avatar = null;
      }
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

    const load = async () => {
      // Run find + count in parallel — saves one full DB round trip
      const [websites, total] = await Promise.all([
        Website.find(query).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar').sort({ [sortBy]: order === 'asc' ? 1 : -1 }).skip(skip).limit(parseInt(limit)),
        Website.countDocuments(query),
      ]);
      return { data: await hydrateWebsitePreviewsAsync(websites), pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) };
    };
    const listing = cacheableListing({ page, limit, sortBy })
      ? await cache.wrap(cache.key('websites', 'browse', JSON.stringify({ page, limit, category, minPrice, maxPrice, sortBy, order })), LISTING_TTL_SEC, load)
      : await load();

    let result = listing.data;

    if (req.userId) {
      const wishlistSet = new Set((await Wishlist.find({ userId: req.userId, websiteId: { $in: result.map(w => w._id) } })).map(w => w.websiteId.toString()));
      result = result.map(w => ({ ...w, isWishlisted: wishlistSet.has(w._id.toString()) }));
    }

    res.json({ success: true, data: result, pagination: listing.pagination });
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

    const load = async () => {
      const [websites, total] = await Promise.all([
        Website.find(query).select('-adminComment -isDeleted -githubUrl').populate('sellerId', 'name email avatar').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
        Website.countDocuments(query),
      ]);
      return { data: await hydrateWebsitePreviewsAsync(websites), pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total) };
    };
    const listing = cacheableListing({ page, limit, sortBy: 'createdAt' })
      ? await cache.wrap(cache.key('websites', 'category', category, page, limit), LISTING_TTL_SEC, load)
      : await load();
    res.json({ success: true, data: listing.data, pagination: listing.pagination });
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

module.exports = { browseWebsites, getWebsiteDetails, getByCategory, searchWebsites, hydrateWebsitePreviewsAsync };