const Website = require('../website/website.model');
const Purchase = require('../payment/purchase.model');
const DownloadLog = require('./downloadLog.model');
const supabaseService = require('../../services/supabase.service');
const { PAYMENT_STATUS, SIGNED_URL_EXPIRY } = require('../../shared/utils/constants');

const isPublicUrl = (filePath) => /^https?:\/\//.test(filePath || '');
const getPublicAssetUrl = (filePath) => {
  if (!filePath) return null;
  if (isPublicUrl(filePath)) return filePath;
  return supabaseService.getPublicUrl(filePath);
};

const getPreviewVideoAccessUrl = async (filePath) => {
  if (!filePath) return null;
  if (isPublicUrl(filePath)) return filePath;
  return supabaseService.createSignedUrl(filePath, 7200);
};

/**
 * @route   GET /api/assets/website/:websiteId
 * @desc    Get signed URLs for purchased website files
 * @access  Private (Must have purchased)
 */
const getAssetUrls = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const userId = req.userId;

    // Check if user purchased this website
    const purchase = await Purchase.findOne({
      websiteId,
      buyerId: userId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
    });

    if (!purchase) {
      return res.status(403).json({
        success: false,
        message: 'You must purchase this website to access its files',
      });
    }

    // Get website details
    const website = await Website.findById(websiteId);

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Check if files exist (at minimum source code and docs)
    if (!website.sourceCodeUrl || !website.docsUrl) {
      return res.status(400).json({
        success: false,
        message: 'Website files are not available yet',
      });
    }

    // Generate signed URLs for available files
    const filePaths = [
      website.sourceCodeUrl,
      website.docsUrl,
    ];

    // Add video if available
    if (website.videoUrl) {
      filePaths.push(website.videoUrl);
    }

    const storagePaths = filePaths.filter((filePath) => !isPublicUrl(filePath));
    const signedUrls = storagePaths.length > 0
      ? await supabaseService.createSignedUrls(storagePaths, SIGNED_URL_EXPIRY)
      : [];
    let signedIndex = 0;
    const getDownloadUrl = (filePath) => {
      if (isPublicUrl(filePath)) return filePath;
      return signedUrls[signedIndex++]?.signedUrl;
    };

    // Log downloads
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const downloadLogs = [
      {
        userId,
        websiteId,
        purchaseId: purchase._id,
        fileType: 'sourceCode',
        fileName: website.files?.sourceCode?.fileName,
        fileSize: website.files?.sourceCode?.size,
        ipAddress,
        userAgent,
      },
      {
        userId,
        websiteId,
        purchaseId: purchase._id,
        fileType: 'docs',
        fileName: website.files?.docs?.fileName,
        fileSize: website.files?.docs?.size,
        ipAddress,
        userAgent,
      },
    ];

    // Add video log if available
    if (website.videoUrl) {
      downloadLogs.push({
        userId,
        websiteId,
        purchaseId: purchase._id,
        fileType: 'video',
        fileName: website.files?.video?.fileName,
        fileSize: website.files?.video?.size,
        ipAddress,
        userAgent,
      });
    }

    await DownloadLog.insertMany(downloadLogs);

    // Increment download count
    const downloadCountIncrement = website.videoUrl ? 3 : 2;
    await Website.findByIdAndUpdate(websiteId, {
      $inc: { downloadCount: downloadCountIncrement },
    });

    // Update purchase last accessed
    purchase.downloadCount += downloadCountIncrement;
    purchase.lastAccessedAt = new Date();
    await purchase.save();

    const expiryTime = new Date(Date.now() + SIGNED_URL_EXPIRY * 1000);

    const responseData = {
      sourceCode: {
        url: getDownloadUrl(website.sourceCodeUrl),
        fileName: website.files?.sourceCode?.fileName,
        size: website.files?.sourceCode?.size,
      },
      docs: {
        url: getDownloadUrl(website.docsUrl),
        fileName: website.files?.docs?.fileName,
        size: website.files?.docs?.size,
      },
      deployedPreview: website.deployedUrl
        ? {
            url: website.deployedUrl,
          }
        : null,
      expiresAt: expiryTime,
      note: 'ZIP/PDF/video links expire in 7 days. Deployed preview and admin-uploaded files remain available from this purchase view.',
    };

    // Add video if available
    if (website.videoUrl) {
      responseData.video = {
        url: getDownloadUrl(website.videoUrl),
        fileName: website.files?.video?.fileName,
        size: website.files?.video?.size,
      };
    }

    if (website.previewVideoUrl) {
      responseData.previewVideo = {
        url: await getPreviewVideoAccessUrl(website.previewVideoUrl),
        fileName: website.files?.previewVideo?.fileName,
        size: website.files?.previewVideo?.size,
      };
    }

    res.json({
      success: true,
      data: responseData,
      message: 'Project access generated successfully.',
    });
  } catch (error) {
    console.error('Get asset URLs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating download links',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/assets/preview/:websiteId
 * @desc    Get public preview video URL
 * @access  Public
 */
const getPreviewUrl = async (req, res) => {
  try {
    const { websiteId } = req.params;

    const website = await Website.findOne({
      _id: websiteId,
      status: 'approved',
      isDeleted: false,
    });

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    if (!website.previewVideoUrl) {
      return res.status(404).json({
        success: false,
        message: 'Preview video not available',
      });
    }

    const previewUrl = await getPreviewVideoAccessUrl(website.previewVideoUrl);

    res.json({
      success: true,
      data: {
        url: previewUrl,
        fileName: website.files?.previewVideo?.fileName,
      },
    });
  } catch (error) {
    console.error('Get preview URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching preview',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/assets/download-history
 * @desc    Get user's download history
 * @access  Private
 */
const getDownloadHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const logs = await DownloadLog.find({ userId: req.userId })
      .populate('websiteId', 'name')
      .sort({ downloadedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await DownloadLog.countDocuments({ userId: req.userId });

    res.json({
      success: true,
      data: logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error) {
    console.error('Get download history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching download history',
      error: error.message,
    });
  }
};

module.exports = {
  getAssetUrls,
  getPreviewUrl,
  getDownloadHistory,
};
