const Brevo = require('@getbrevo/brevo');

if (!process.env.BREVO_API_KEY) {
  console.warn('⚠️  BREVO_API_KEY not set. Email features will not work.');
}

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY || '';

module.exports = apiInstance;