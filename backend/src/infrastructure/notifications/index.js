'use strict';

// Producer-side entry point. The worker-only processor is imported directly by the worker
// (./notificationProcessor) so the web process never loads it.
module.exports = {
  ...require('./notificationEvents'),
  settings: require('./settings.service'),
  getWhatsAppConfig: require('./config').getWhatsAppConfig,
};
