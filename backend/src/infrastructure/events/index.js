'use strict';

const { notifySubscriptionPaid, notifyWebsitePurchased } = require('../notifications/notificationEvents');

module.exports = { ...require('./emailJobs'), ...require('./securityEmails'), notifySubscriptionPaid, notifyWebsitePurchased };
