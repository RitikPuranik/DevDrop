const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const sellerController = require('./seller.controller');

router.use(auth);

router.post('/websites', verifyEmail, [validators.websiteName(), validators.description(), validators.category(), validators.price(), validators.url('deployedUrl'), validators.githubUrl(), handleValidationErrors], sellerController.submitWebsite);
router.get('/websites', sellerController.getMyWebsites);
router.put('/websites/:id', sellerController.updateWebsite);
router.delete('/websites/:id', sellerController.deleteOwnWebsite);
router.get('/earnings', sellerController.getEarnings);
router.get('/payouts', sellerController.getPayouts);

module.exports = router;
