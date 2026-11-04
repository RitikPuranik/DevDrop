const express = require('express');
const router = express.Router();

const { auth } = require('../../shared/middleware/auth');
const verifyEmail = require('../../shared/middleware/verifyEmail');
const { authLimiter, deployLimiter, rollbackLimiter, deploymentLogsLimiter, versionSyncLimiter } = require('../../shared/middleware/rateLimit');
const { body, query } = require('express-validator');
const { validators, handleValidationErrors } = require('../../shared/utils/validators');
const deploymentController = require('./deployment.controller');
const versionsController = require('./deploymentVersions.controller');

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

// Personal projects — deploy the user's own GitHub repo with no purchase
// involved. Literal segments, so (like '/providers') these MUST be
// registered before the '/analyze/:websiteId' and '/:websiteId' patterns
// below, or Express would try to match "personal" as a :websiteId value.
router.post('/personal/analyze', verifyEmail, deploymentController.analyzePersonalRepository);
router.post('/personal', verifyEmail, deployLimiter, deploymentController.createPersonalDeployment);

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

// ── Version history, rollback, logs ──
// Multi-segment paths, so they can't collide with the single-segment '/:websiteId' / '/:deploymentId' routes.
// :deploymentId is the DevDrop site record; ownership is verified server-side on every call.
const dep = [validators.mongoId('deploymentId')];
const depVersion = [validators.mongoId('deploymentId'), validators.mongoId('versionId')];

router.get('/:deploymentId/versions', ...dep, query('limit').optional().isInt({ min: 1, max: 50 }), query('environment').optional().isIn(['production', 'preview']), query('state').optional().isIn(['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR', 'CANCELED']), handleValidationErrors, versionsController.listVersions);
router.post('/:deploymentId/versions/sync', ...dep, handleValidationErrors, versionSyncLimiter, versionsController.syncVersions);
router.get('/:deploymentId/versions/:versionId', ...depVersion, handleValidationErrors, versionsController.getVersion);
router.get('/:deploymentId/versions/:versionId/rollback-check', ...depVersion, handleValidationErrors, deploymentLogsLimiter, versionsController.rollbackCheck);

const logQuery = [
  query('type').optional().isIn(['build', 'runtime', 'error']),
  query('q').optional().isString().isLength({ max: 200 }),
  query('severity').optional().isString().isLength({ max: 60 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('order').optional().isIn(['asc', 'desc']),
  query('cursor').optional().isString().isLength({ max: 200 }),
];
router.get('/:deploymentId/versions/:versionId/logs', ...depVersion, ...logQuery, handleValidationErrors, deploymentLogsLimiter, versionsController.getLogs);
router.get('/:deploymentId/versions/:versionId/logs/build', ...depVersion, ...logQuery, handleValidationErrors, deploymentLogsLimiter, versionsController.getBuildLogs);

router.post(
  '/:deploymentId/rollback',
  ...dep,
  body('versionId').isMongoId().withMessage('versionId is required'),
  body('confirm').equals('true').withMessage('Rollback must be explicitly confirmed').bail().toBoolean(),
  body('idempotencyKey').optional().isString().matches(/^[A-Za-z0-9_-]{8,100}$/).withMessage('Invalid idempotency key'),
  body('reason').optional().isString().isLength({ max: 200 }),
  handleValidationErrors,
  verifyEmail,
  rollbackLimiter,
  versionsController.createRollback
);
router.get('/:deploymentId/rollbacks', ...dep, handleValidationErrors, versionsController.listOperations);
router.get('/:deploymentId/rollback/:operationId', validators.mongoId('deploymentId'), validators.mongoId('operationId'), handleValidationErrors, versionsController.getOperation);
router.post('/:deploymentId/rollback/:operationId/retry', validators.mongoId('deploymentId'), validators.mongoId('operationId'), handleValidationErrors, verifyEmail, rollbackLimiter, versionsController.retryOperation);

module.exports = router;
