const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const { uploadMultiple, handleMulterError } = require('../../shared/middleware/uploadValidation');
const adminController = require('./admin.controller');

router.use(auth, adminOnly);

router.get('/dashboard', adminController.getDashboard);
router.get('/websites/pending', adminController.getPendingWebsites);
router.put('/websites/:id/request-changes', adminController.requestChanges);
router.put('/websites/:id/reject', adminController.rejectWebsite);
router.post('/websites/:id/approve', uploadMultiple.fields([{ name: 'sourceCode', maxCount: 1 }, { name: 'docs', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'previewVideo', maxCount: 1 }]), handleMulterError, adminController.approveWebsite);
router.post('/websites/:id/relist', adminController.relistWebsite);
router.delete('/websites/:id', adminController.deleteWebsite);
router.get('/payouts/pending', adminController.getPendingPayouts);
router.post('/payouts/:id/process', adminController.processPayout);

module.exports = router;
