const crypto = require('crypto');

/**
 * AES-256-GCM helpers for encrypting sensitive tokens (e.g. GitHub OAuth
 * access tokens) before they're persisted to the database.
 *
 * Storage format: "<ivHex>:<authTagHex>:<ciphertextHex>"
 *
 * The key is read lazily (not at module load) so the server can still boot
 * in environments where this feature isn't configured yet — the error only
 * surfaces when something actually tries to encrypt/decrypt a token.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

const getKey = () => {
  const hex = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY is not configured.');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).');
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
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload.');
  }

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
