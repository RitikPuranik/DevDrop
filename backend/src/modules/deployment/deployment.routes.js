const express = require('express');
const router = express.Router();

const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { authLimiter, deployLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const deploymentController = require('./deployment.controller');
const deploymentCatalogController = require('./deployment.catalog.controller');

// Public Vercel callback. It cannot identify the user, so it only redirects
// the short-lived OAuth code to the authenticated frontend callback page.
router.get('/providers/vercel/callback', deploymentController.vercelCallback);

router.use(auth);

// Provider connection state and catalog endpoints.
router.get('/providers', deploymentController.getProviders);
router.get('/providers/vercel/accounts', deploymentCatalogController.getVercelAccounts);
router.get('/providers/vercel/projects', deploymentCatalogController.getVercelProjects);
router.post('/providers/vercel/connect', authLimiter, deploymentController.connectVercel);
router.post('/providers/vercel/finish-connect', authLimiter, deploymentController.finishConnectVercel);
router.delete('/providers/vercel/disconnect', deploymentController.disconnectVercel);

router.get('/providers/render/services', deploymentCatalogController.getRenderServices);
router.post('/providers/render/connect', authLimiter, deploymentController.connectRender);
router.patch('/providers/render/owner', deploymentController.setRenderOwner);
router.delete('/providers/render/disconnect', deploymentController.disconnectRender);

router.post('/analyze/:websiteId', validators.mongoId('websiteId'), handleValidationErrors, deploymentController.analyze);
router.get('/website/:websiteId', validators.mongoId('websiteId'), handleValidationErrors, deploymentController.getDeploymentForWebsite);

router.post(
  '/:websiteId',
  validators.mongoId('websiteId'),
  handleValidationErrors,
  verifyEmail,
  deployLimiter,
  deploymentController.createDeployment
);

router.get('/', validators.pagination(), handleValidationErrors, deploymentController.listDeployments);
router.get('/:deploymentId', validators.mongoId('deploymentId'), handleValidationErrors, deploymentController.getDeployment);
router.post(
  '/:deploymentId/redeploy',
  validators.mongoId('deploymentId'),
  handleValidationErrors,
  verifyEmail,
  deployLimiter,
  deploymentController.redeploy
);
router.post('/:deploymentId/cancel', validators.mongoId('deploymentId'), handleValidationErrors, deploymentController.cancelDeployment);

module.exports = router;
