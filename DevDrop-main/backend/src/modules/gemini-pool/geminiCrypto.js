const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const ENV_KEY = 'AI_GEMINI_TOKEN_ENCRYPTION_KEY';

function getKey() {
  const hex = process.env[ENV_KEY];
  if (!hex) throw new Error(`${ENV_KEY} is not configured on the backend.`);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${ENV_KEY} must be a 32-byte hex string (64 hex characters).`);
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`${ENV_KEY} must be a 32-byte hex string (64 hex characters).`);
  }
  return key;
}

function encrypt(plainText) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted Gemini API key.');

  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== 16) {
    throw new Error('Malformed encrypted Gemini API key.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
