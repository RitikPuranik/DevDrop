const crypto = require('crypto');

/**
 * AES-256-GCM helper used EXCLUSIVELY to encrypt/decrypt Gemini API keys
 * stored in the `gemini_api_keys` / `geminiapikeys` collection.
 *
 * This is intentionally a completely separate secret and code path from
 * backend/src/shared/utils/crypto.js (which protects GitHub/Vercel/Render
 * tokens under TOKEN_ENCRYPTION_KEY). The backend encrypts Gemini credentials
 * before persisting ciphertext; ai-service only decrypts that ciphertext in
 * memory when it needs to call Gemini.
 *
 * Master key: AI_GEMINI_TOKEN_ENCRYPTION_KEY
 *   - MUST match backend/.env because backend encrypts and ai-service decrypts
 *   - MUST be kept server-side and never shipped to the frontend
 *   - is a 32-byte key, given as a 64-character hex string
 *
 * Storage format: "<ivHex>:<authTagHex>:<ciphertextHex>"
 *   - a fresh random 12-byte IV is generated per encryption (never reused)
 *   - the GCM authentication tag is stored alongside the ciphertext so
 *     tampering is detected on decrypt (authenticated decryption)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey() {
  const hex = process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('AI_GEMINI_TOKEN_ENCRYPTION_KEY is not configured on ai-service.');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error('AI_GEMINI_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).');
  }
  return key;
}

/**
 * Encrypts a plaintext Gemini API key. Never logs or returns the plaintext
 * that was passed in — callers are responsible for discarding their own
 * reference to it once this returns.
 */
function encrypt(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a Gemini API key payload produced by encrypt(). Throws (rather
 * than returning something partial/garbled) if the master key is wrong or
 * the ciphertext/tag has been tampered with — GCM authentication fails
 * closed. Never include the decrypted value in a thrown error.
 */
function decrypt(payload) {
  const key = getKey();
  const parts = String(payload || '').split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted Gemini key payload.');
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Malformed encrypted Gemini key payload.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
