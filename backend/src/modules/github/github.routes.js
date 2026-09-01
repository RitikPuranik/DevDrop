const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { exportLimiter, authLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const githubController = require('./github.controller');

// GitHub redirects the user's browser here directly — no Authorization
// header will be present, so this must stay outside router.use(auth).
router.get('/callback', githubController.callback);

router.use(auth);

router.post('/connect', authLimiter, githubController.connect);
router.get('/status', githubController.status);
router.get('/repositories', githubController.listRepositories);
router.delete('/disconnect', githubController.disconnect);

router.post(
  '/export/:websiteId',
  verifyEmail,
  exportLimiter,
  [
    validators.mongoId('websiteId'),
    body('repositoryName')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Repository name is required (max 100 characters)'),
    body('description').optional({ checkFalsy: true }).trim().isLength({ max: 350 }).withMessage('Description must be under 350 characters'),
    body('visibility').isIn(['public', 'private']).withMessage('Visibility must be public or private'),
    handleValidationErrors,
  ],
  githubController.createExport
);

// Must come before '/exports/:exportId' or Express will treat "website" as an exportId.
router.get('/exports/website/:websiteId', validators.mongoId('websiteId'), handleValidationErrors, githubController.getExportForWebsite);
router.get('/exports/:exportId', validators.mongoId('exportId'), handleValidationErrors, githubController.getExportStatus);
router.get('/exports', validators.pagination(), handleValidationErrors, githubController.listExports);

module.exports = router;
