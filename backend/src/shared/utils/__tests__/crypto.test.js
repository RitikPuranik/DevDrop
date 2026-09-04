describe('crypto (token encryption)', () => {
  let encrypt, decrypt;

  beforeEach(() => {
    jest.resetModules();
    ({ encrypt, decrypt } = require('../crypto'));
  });

  it('round-trips a plaintext string through encrypt/decrypt', () => {
    const plain = 'gho_supersecrettoken1234567890';
    const payload = encrypt(plain);
    expect(payload.split(':')).toHaveLength(3);
    expect(decrypt(payload)).toBe(plain);
  });

  it('produces a different ciphertext each time (random IV) even for the same input', () => {
    const a = encrypt('same-value');
    const b = encrypt('same-value');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same-value');
    expect(decrypt(b)).toBe('same-value');
  });

  it('throws on a malformed payload', () => {
    expect(() => decrypt('not-the-right-format')).toThrow('Malformed encrypted payload.');
  });

  it('throws on a tampered ciphertext (auth tag mismatch)', () => {
    const payload = encrypt('secret');
    const [iv, tag, data] = payload.split(':');
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === '00' ? '11' : '00');
    expect(() => decrypt(`${iv}:${tag}:${tamperedData}`)).toThrow();
  });

  it('throws a clear error when TOKEN_ENCRYPTION_KEY is not configured', () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    jest.resetModules();
    const freshCrypto = require('../crypto');
    expect(() => freshCrypto.encrypt('x')).toThrow(/TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });

  it('falls back to GITHUB_TOKEN_ENCRYPTION_KEY when TOKEN_ENCRYPTION_KEY is unset', () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
    jest.resetModules();
    const freshCrypto = require('../crypto');
    const payload = freshCrypto.encrypt('legacy-key-path');
    expect(freshCrypto.decrypt(payload)).toBe('legacy-key-path');
    process.env.TOKEN_ENCRYPTION_KEY = original;
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  });

  it('rejects a key that is not 32 bytes', () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = 'tooshort';
    jest.resetModules();
    const freshCrypto = require('../crypto');
    expect(() => freshCrypto.encrypt('x')).toThrow(/32-byte hex/);
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });
});
