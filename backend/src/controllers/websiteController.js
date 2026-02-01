const Website = require('../models/Website');
const Wishlist = require('../models/Wishlist');
const { getPaginationMetadata } = require('../utils/helpers');
const { PAGINATION, WEBSITE_STATUS } = require('../utils/constants');

/**
 * @route   GET /api/websites
 * @desc    Browse all approved websites
 * @access  Public (optionalAuth for wishlist status)
 */
const browseWebsites = async (req, res) => {
  try {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      category,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      order = 'desc',
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    const query = {
      status: WEBSITE_STATUS.APPROVED,
      isDeleted: false,
    };

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Exclude sold exclusive websites
    const excludeSoldExclusive = {
      $or: [
        { category: { $ne: 'exclusive' } },
        { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } },
      ],
    };

    Object.assign(query, excludeSoldExclusive);

    // Build sort object
    const sortOrder = order === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Execute query
    const websites = await Website.find(query)
      .select('-adminComment -files -isDeleted')
      .populate('sellerId', 'email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Website.countDocuments(query);

    // If user is authenticated, check wishlist status
    let websitesWithWishlist = websites;
    if (req.userId) {
      const websiteIds = websites.map(w => w._id);
      const wishlists = await Wishlist.find({
        userId: req.userId,
        websiteId: { $in: websiteIds },
      });

      const wishlistMap = new Set(wishlists.map(w => w.websiteId.toString()));

      websitesWithWishlist = websites.map(website => {
        const websiteObj = website.toObject();
        websiteObj.isWishlisted = wishlistMap.has(website._id.toString());
        return websiteObj;
      });
    }

    res.json({
      success: true,
      data: websitesWithWishlist,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Browse websites error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching websites',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/websites/:id
 * @desc    Get single website details
 * @access  Public (optionalAuth for wishlist status)
 */
const getWebsiteDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const website = await Website.findOne({
      _id: id,
      status: WEBSITE_STATUS.APPROVED,
      isDeleted: false,
    })
      .select('-adminComment -isDeleted')
      .populate('sellerId', 'email');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Check if exclusive and sold
    if (website.category === 'exclusive' && website.status === WEBSITE_STATUS.SOLD) {
      return res.status(404).json({
        success: false,
        message: 'This website is no longer available',
      });
    }

    // Increment view count
    await Website.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

    // Check if wishlisted by current user
    let isWishlisted = false;
    if (req.userId) {
      const wishlist = await Wishlist.findOne({
        userId: req.userId,
        websiteId: id,
      });
      isWishlisted = !!wishlist;
    }

    const websiteData = website.toObject();
    websiteData.isWishlisted = isWishlisted;

    res.json({
      success: true,
      data: websiteData,
    });
  } catch (error) {
    console.error('Get website details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching website details',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/websites/category/:category
 * @desc    Get websites by category
 * @access  Public
 */
const getByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const validCategories = ['free', 'paid', 'exclusive'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category',
      });
    }

    const skip = (page - 1) * limit;

    const query = {
      category,
      status: WEBSITE_STATUS.APPROVED,
      isDeleted: false,
    };

    // Exclude sold exclusive
    if (category === 'exclusive') {
      query.status = { $ne: WEBSITE_STATUS.SOLD };
    }

    const websites = await Website.find(query)
      .select('-adminComment -files -isDeleted')
      .populate('sellerId', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Website.countDocuments(query);

    res.json({
      success: true,
      data: websites,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching websites',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/websites/search
 * @desc    Search websites
 * @access  Public
 */
const searchWebsites = async (req, res) => {
  try {
    const { q, page = 1, limit = 20, category } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters',
      });
    }

    const skip = (page - 1) * limit;

    // Build search query
    const query = {
      status: WEBSITE_STATUS.APPROVED,
      isDeleted: false,
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ],
    };

    // Add category filter if provided
    if (category) {
      query.category = category;
    }

    // Exclude sold exclusive
    query.$and = [
      {
        $or: [
          { category: { $ne: 'exclusive' } },
          { category: 'exclusive', status: { $ne: WEBSITE_STATUS.SOLD } },
        ],
      },
    ];

    const websites = await Website.find(query)
      .select('-adminComment -files -isDeleted')
      .populate('sellerId', 'email')
      .sort({ viewCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Website.countDocuments(query);

    res.json({
      success: true,
      data: websites,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
      searchQuery: q,
    });
  } catch (error) {
    console.error('Search websites error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching websites',
      error: error.message,
    });
  }
};

module.exports = {
  browseWebsites,
  getWebsiteDetails,
  getByCategory,
  searchWebsites,
};