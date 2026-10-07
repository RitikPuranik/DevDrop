const crypto = require('crypto');

const VALID_KEY = crypto.randomBytes(32).toString('hex');

function withKey(hexKey, fn) {
  const prev = process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
  process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = hexKey;
  jest.resetModules();
  try {
    return fn(require('../src/utils/geminiCrypto'));
  } finally {
    if (prev === undefined) delete process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY;
    else process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = prev;
    jest.resetModules();
  }
}

describe('geminiCrypto', () => {
  test('encrypt/decrypt round trip returns the original plaintext', () => {
    withKey(VALID_KEY, ({ encrypt, decrypt }) => {
      const plain = 'AIzaSyTestGeminiKey1234567890';
      const encrypted = encrypt(plain);
      expect(decrypt(encrypted)).toBe(plain);
    });
  });

  test('encrypted payload has the iv:authTag:ciphertext shape', () => {
    withKey(VALID_KEY, ({ encrypt }) => {
      const encrypted = encrypt('AIzaSomeKey');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // 12-byte IV as hex
      expect(parts[1]).toHaveLength(32); // 16-byte GCM auth tag as hex
    });
  });

  test('decrypting with the wrong master key fails', () => {
    const encrypted = withKey(VALID_KEY, ({ encrypt }) => encrypt('AIzaSomeKey'));
    const otherKey = crypto.randomBytes(32).toString('hex');
    withKey(otherKey, ({ decrypt }) => {
      expect(() => decrypt(encrypted)).toThrow();
    });
  });

  test('a tampered ciphertext fails authentication', () => {
    withKey(VALID_KEY, ({ encrypt, decrypt }) => {
      const encrypted = encrypt('AIzaSomeKey');
      const [iv, tag, data] = encrypted.split(':');
      // Flip a hex character in the ciphertext body.
      const tamperedChar = data[0] === '0' ? '1' : '0';
      const tampered = `${iv}:${tag}:${tamperedChar}${data.slice(1)}`;
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  test('a tampered auth tag fails authentication', () => {
    withKey(VALID_KEY, ({ encrypt, decrypt }) => {
      const encrypted = encrypt('AIzaSomeKey');
      const [iv, tag, data] = encrypted.split(':');
      const tamperedChar = tag[0] === '0' ? '1' : '0';
      const tampered = `${iv}:${tamperedChar}${tag.slice(1)}:${data}`;
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  test('two encryptions of the same plaintext use different IVs and ciphertext', () => {
    withKey(VALID_KEY, ({ encrypt }) => {
      const a = encrypt('AIzaSameKeyValue');
      const b = encrypt('AIzaSameKeyValue');
      expect(a).not.toBe(b);
      expect(a.split(':')[0]).not.toBe(b.split(':')[0]); // different IVs
    });
  });

  test('missing master key configuration fails safely (throws, does not silently proceed)', () => {
    withKey(undefined, ({ encrypt }) => {
      expect(() => encrypt('AIzaSomeKey')).toThrow(/AI_GEMINI_TOKEN_ENCRYPTION_KEY/);
    });
  });

  test('a malformed (too short) master key fails safely', () => {
    withKey('deadbeef', ({ encrypt }) => {
      expect(() => encrypt('AIzaSomeKey')).toThrow(/32-byte/);
    });
  });

  test('a malformed encrypted payload fails safely on decrypt', () => {
    withKey(VALID_KEY, ({ decrypt }) => {
      expect(() => decrypt('not-a-valid-payload')).toThrow();
      expect(() => decrypt('')).toThrow();
    });
  });
});
