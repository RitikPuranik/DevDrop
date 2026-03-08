const { Cashfree } = require('cashfree-pg');

if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
  console.warn('⚠️  CASHFREE_APP_ID or CASHFREE_SECRET_KEY not set.');
}

Cashfree.XClientId = process.env.CASHFREE_APP_ID || '';
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY || '';
Cashfree.XEnvironment = process.env.NODE_ENV === 'production'
  ? Cashfree.Environment.PRODUCTION
  : Cashfree.Environment.SANDBOX;

module.exports = Cashfree;
