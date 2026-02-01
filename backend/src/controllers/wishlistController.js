const Wishlist = require('../models/Wishlist');
const Website = require('../models/Website');
const { getPaginationMetadata } = require('../utils/helpers');

/**
 * @route   POST /api/wishlist/:websiteId
 * @desc    Add website to wishlist
 * @access  Private
 */
const addToWishlist = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.userId;

    // Check if website exists
    const website = await Website.findById(websiteId);

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Try to create wishlist entry
    try {
      const wishlist = new Wishlist({
        userId,
        websiteId,
      });

      await wishlist.save();

      // Increment wishlist count on website
      await Website.findByIdAndUpdate(websiteId, {
        $inc: { wishlistCount: 1 },
      });

      res.status(201).json({
        success: true,
        message: 'Added to wishlist',
        data: wishlist,
      });
    } catch (error) {
      // Duplicate key error - already in wishlist
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Website already in wishlist',
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding to wishlist',
      error: error.message,
    });
  }
};

/**
 * @route   DELETE /api/wishlist/:websiteId
 * @desc    Remove from wishlist
 * @access  Private
 */
const removeFromWishlist = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.userId;

    const wishlist = await Wishlist.findOneAndDelete({
      userId,
      websiteId,
    });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Website not found in wishlist',
      });
    }

    // Decrement wishlist count on website
    await Website.findByIdAndUpdate(websiteId, {
      $inc: { wishlistCount: -1 },
    });

    res.json({
      success: true,
      message: 'Removed from wishlist',
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing from wishlist',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/wishlist
 * @desc    Get user's wishlist
 * @access  Private
 */
const getWishlist = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const wishlists = await Wishlist.find({ userId: req.userId })
      .populate({
        path: 'websiteId',
        select: 'name description category price deployedUrl status',
        match: { isDeleted: false }, // Only get non-deleted websites
      })
      .sort({ addedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter out null websites (deleted ones)
    const validWishlists = wishlists.filter(w => w.websiteId !== null);

    const total = await Wishlist.countDocuments({ userId: req.userId });

    res.json({
      success: true,
      data: validWishlists,
      pagination: getPaginationMetadata(parseInt(page), parseInt(limit), total),
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching wishlist',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/wishlist/check/:websiteId
 * @desc    Check if website is in wishlist
 * @access  Private
 */
const checkWishlist = async (req, res) => {
  try {
    const { websiteId } = req.params;

    const wishlist = await Wishlist.findOne({
      userId: req.userId,
      websiteId,
    });

    res.json({
      success: true,
      data: {
        isWishlisted: !!wishlist,
      },
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking wishlist',
      error: error.message,
    });
  }
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  checkWishlist,
};