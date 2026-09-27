const express = require('express');
const multer = require('multer');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const { handleMulterError } = require('../../shared/middleware/uploadValidation');
const controller = require('./aiStudio.controller');

const uploadAsset = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_AI_STUDIO_ASSET, 10) || 10 * 1024 * 1024 },
});

// Every route requires an authenticated DevDrop user. Ownership of the
// specific :projectId is additionally enforced inside the controller/
// lifecycle service (a user may only ever touch req.userId's own projects).
router.post('/session', auth, controller.openSession);
router.post('/:projectId/heartbeat', auth, controller.heartbeat);
router.post('/:projectId/activity', auth, controller.recordActivity);
router.post('/:projectId/sync', auth, controller.syncFiles);
router.get('/:projectId/download', auth, controller.downloadProject);
router.post('/:projectId/assets', auth, uploadAsset.single('file'), handleMulterError, controller.uploadAsset);
router.delete('/:projectId/assets/:assetId', auth, controller.deleteAsset);
router.post('/:projectId/close', auth, controller.closeSessionTab);

module.exports = router;
