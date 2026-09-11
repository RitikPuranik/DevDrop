const crypto = require('crypto');

/**
 * Same AES-256-GCM helper and TOKEN_ENCRYPTION_KEY as
 * backend/src/shared/utils/crypto.js. ai-service is a separate process, so
 * it needs its own copy to decrypt Gemini keys read from the shared
 * GeminiApiKey collection — the encryption key itself must be set to the
 * SAME value in both backend/.env and ai-service/.env.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getKey = () => {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured on ai-service (must match backend).');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).');
  }
  return key;
};

const encrypt = (plainText) => {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (payload) => {
  const key = getKey();
  const parts = String(payload || '').split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload.');
  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
};

module.exports = { encrypt, decrypt };
