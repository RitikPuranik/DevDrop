const nodemailer = require('nodemailer');

if (!process.env.BREVO_SMTP_KEY) {
  console.warn('⚠️  BREVO_SMTP_KEY not set. Email features will not work.');
}

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.BREVO_USER || '', // Your login email for Brevo
    pass: process.env.BREVO_SMTP_KEY || '', // Your SMTP Key
  },
});

module.exports = transporter;
