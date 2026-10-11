'use strict';

module.exports = { ...require('./cache.service'), closeCacheClient: require('./connection').closeCacheClient };
