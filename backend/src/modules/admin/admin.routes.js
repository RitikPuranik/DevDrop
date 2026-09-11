const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const adminOnly = require('../../shared/middleware/adminOnly');
const { uploadMultiple, handleMulterError } = require('../../shared/middleware/uploadValidation');
const adminController = require('./admin.controller');
const backupController = require('../backup/backup.controller');
const couponController = require('../coupons/coupon.controller');
const geminiPoolController = require('../gemini-pool/geminiPool.controller');

router.use(auth, adminOnly);

router.get('/dashboard', adminController.getDashboard);
router.get('/coupons', couponController.getCoupons);
router.post('/coupons', couponController.createCoupon);
router.patch('/coupons/:id/toggle', couponController.toggleCoupon);
router.post('/websites', uploadMultiple.fields([{ name: 'sourceCode', maxCount: 1 }, { name: 'docs', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'previewVideo', maxCount: 1 }]), handleMulterError, adminController.createWebsite);
router.get('/websites', adminController.getAllWebsites);
router.put('/websites/:id/request-changes', adminController.requestChanges);
router.put('/websites/:id/reject', adminController.rejectWebsite);
router.post('/websites/:id/approve', uploadMultiple.fields([{ name: 'sourceCode', maxCount: 1 }, { name: 'docs', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'previewVideo', maxCount: 1 }]), handleMulterError, adminController.approveWebsite);
router.post('/websites/:id/relist', adminController.relistWebsite);
router.delete('/websites/:id', adminController.deleteWebsite);
router.get('/payouts/pending', adminController.getPendingPayouts);
router.post('/payouts/:id/process', adminController.processPayout);

// Backup & restore (MongoDB + Supabase storage, mirrored against admin-provided backup credentials)
router.get('/backup/status', backupController.getStatus);
router.get('/backup/history', backupController.getHistory);
router.post('/backup/mongo', backupController.backupMongo);
router.post('/backup/supabase', backupController.backupSupabase);
router.post('/backup/full', backupController.backupFull);

// Gemini API key pool (AI Studio) — config lives in Mongo here, live
// selection/health tracking happens in ai-service.
router.get('/gemini-keys', geminiPoolController.listKeys);
router.post('/gemini-keys', geminiPoolController.addKey);
router.post('/gemini-keys/reorder', geminiPoolController.reorderKeys);
router.post('/gemini-keys/:id/test', geminiPoolController.testKey);
router.patch('/gemini-keys/:id', geminiPoolController.updateKey);
router.delete('/gemini-keys/:id', geminiPoolController.deleteKey);
router.get('/gemini-pool/status', geminiPoolController.getPoolStatus);

module.exports = router;
