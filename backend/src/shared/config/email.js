const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  console.warn('⚠️  RESEND_API_KEY not set. Email features will not work.');
}

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = resend;
