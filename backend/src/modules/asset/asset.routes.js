const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const assetController = require('./asset.controller');

router.use(auth);
router.get('/download/:websiteId', assetController.getAssetUrls);
router.get('/history', assetController.getDownloadHistory);
router.get('/preview/:websiteId', assetController.getPreviewUrl);

module.exports = router;