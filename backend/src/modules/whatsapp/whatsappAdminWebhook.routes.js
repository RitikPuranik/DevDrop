'use strict';
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const controller = require('./whatsappAdminWebhook.controller');

// Meta signature validation requires the exact raw request bytes.
router.get('/', controller.verify);
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), controller.receive);
module.exports = router;
