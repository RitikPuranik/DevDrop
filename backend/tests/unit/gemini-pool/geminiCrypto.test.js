const crypto = require('crypto');

const original = process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

const { encrypt, decrypt } = require('../../../src/modules/gemini-pool/geminiCrypto');

afterAll(() => {
  if (original === undefined) delete process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
  else process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = original;
});

describe('Gemini crypto', () => {
  test('round trips plaintext', () => {
    const value = 'AIzaExampleGeminiKey123456';
    expect(decrypt(encrypt(value))).toBe(value);
  });

  test('uses a fresh IV and ciphertext for the same plaintext', () => {
    const first = encrypt('AIzaSameValue123456');
    const second = encrypt('AIzaSameValue123456');
    expect(second).not.toBe(first);
  });

  test('tampering fails authenticated decryption', () => {
    const payload = encrypt('AIzaTamperValue123456');
    const [iv, tag, data] = payload.split(':');
    const replacement = `${data.slice(0, -2)}${data.slice(-2) === '00' ? 'ff' : '00'}`;
    expect(() => decrypt(`${iv}:${tag}:${replacement}`)).toThrow();
  });

  test('fails without the dedicated Gemini encryption key', () => {
    const saved = process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
    delete process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
    expect(() => encrypt('AIzaValue123456')).toThrow(/AI_GEMINI_TOKEN_ENCRYPTION_KEY/);
    process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = saved;
  });
});
