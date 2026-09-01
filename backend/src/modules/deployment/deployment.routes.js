const express = require('express');
const router = express.Router();

const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { authLimiter, deployLimiter } = require('../../shared/middleware/rateLimit');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const deploymentController = require('./deployment.controller');

// Vercel redirects the user's browser here directly — no Authorization
// header will be present, so this must stay outside router.use(auth).
// This route can't identify a user at all (see vercel.provider.js); it
// only relays the code back to the opener tab. finish-connect (below,
// inside router.use(auth)) does the actual identified exchange + save.
router.get('/providers/vercel/callback', deploymentController.vercelCallback);

router.use(auth);

// NOTE on ordering: '/providers' and '/:deploymentId' are both single-segment
// GET routes, so '/providers' MUST be registered first — otherwise Express
// would treat "providers" as a :deploymentId value (same hazard the GitHub
// routes avoid with '/exports/website/:websiteId' vs '/exports/:exportId').
router.get('/providers', deploymentController.getProviders);
router.post('/providers/vercel/connect', authLimiter, deploymentController.connectVercel);
router.post('/providers/vercel/finish-connect', authLimiter, deploymentController.finishConnectVercel);
router.delete('/providers/vercel/disconnect', deploymentController.disconnectVercel);

router.post('/providers/render/connect', authLimiter, deploymentController.connectRender);
router.patch('/providers/render/owner', deploymentController.setRenderOwner);
router.delete('/providers/render/disconnect', deploymentController.disconnectRender);

router.post('/analyze/:websiteId', validators.mongoId('websiteId'), handleValidationErrors, deploymentController.analyze);

// Must come before '/:deploymentId' for the same reason as '/providers' above.
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
