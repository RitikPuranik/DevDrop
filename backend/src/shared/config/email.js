const SibApiV3Sdk = require('@getbrevo/brevo');

if (!process.env.BREVO_API_KEY) {
  console.warn('⚠️  BREVO_API_KEY not set. Email features will not work.');
}

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY || '';

module.exports = apiInstance;