const { redactText, sanitizeText, REDACTED, MAX_MESSAGE_CHARS } = require('../../../../../src/services/deployment/logRedaction');

describe('logRedaction', () => {
  const secrets = [
    ['connection string with credentials', 'DATABASE_URL=postgres://admin:hunter2@db.example.com:5432/app', ['hunter2', 'admin:']],
    ['mongodb srv uri', 'MONGODB_URI=mongodb+srv://u:p4ss@cluster0.mongodb.net/db', ['p4ss']],
    ['authorization header', 'Authorization: Bearer abcdef1234567890xyz', ['abcdef1234567890xyz']],
    ['bearer token inline', 'sent header bearer abcdef1234567890xyz ok', ['abcdef1234567890xyz']],
    ['json password', '{"password":"p@ss w0rd","user":"bob"}', ['p@ss w0rd']],
    ['quoted secret env', 'JWT_SECRET="my super secret" started', ['my super secret']],
    ['github token', 'using ghp_abcdefghijklmnopqrstuvwxyz0123456789', ['ghp_abcdefghijklmnopqrstuvwxyz0123456789']],
    ['aws key', 'key AKIAIOSFODNN7EXAMPLE used', ['AKIAIOSFODNN7EXAMPLE']],
    ['query token', 'GET /api?access_token=abc123secret&x=1', ['abc123secret']],
    ['jwt', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmn', ['eyJhbGciOiJIUzI1NiJ9']],
    ['stripe key', 'sk_live_abcdefghij1234567890', ['sk_live_abcdefghij1234567890']],
    ['cookie header', 'cookie: session=abc123; other=1', ['abc123']],
    ['pem block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----', ['MIIEabc']],
  ];

  it.each(secrets)('redacts %s', (_name, input, mustNotAppear) => {
    const out = redactText(input);
    mustNotAppear.forEach((s) => expect(out).not.toContain(s));
    expect(out).toContain(REDACTED);
  });

  it('leaves ordinary build output untouched', () => {
    const line = 'Compiled successfully in 3.2s (NODE_ENV=production) added 677 packages';
    expect(redactText(line)).toBe(line);
  });

  it('strips ANSI escapes and control characters', () => {
    expect(sanitizeText('\u001b[31mError\u001b[0m: bad\u0007')).toBe('Error: bad');
  });

  it('caps very long messages', () => {
    const out = sanitizeText('x'.repeat(MAX_MESSAGE_CHARS + 500));
    expect(out.length).toBeLessThan(MAX_MESSAGE_CHARS + 30);
    expect(out).toMatch(/truncated/);
  });

  it('never returns HTML-interpreted content (text only, markup stays literal)', () => {
    expect(redactText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});
