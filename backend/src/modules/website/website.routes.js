const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../../shared/middleware/auth');
const websiteController = require('./website.controller');

router.get('/', optionalAuth, websiteController.browseWebsites);
router.get('/search', websiteController.searchWebsites);
router.get('/category/:category', websiteController.getByCategory);
router.get('/:id', optionalAuth, websiteController.getWebsiteDetails);

module.exports = router;
