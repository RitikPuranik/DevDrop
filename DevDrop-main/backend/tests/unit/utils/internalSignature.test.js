const { buildHeaders, verifySignature, TIMESTAMP_HEADER, SIGNATURE_HEADER } = require('../../../src/shared/utils/internalSignature');

describe('internalSignature', () => {
  const body = JSON.stringify({ a: 1 });

  it('verifies a valid signature and rejects tampering / wrong secret / missing secret', () => {
    const h = buildHeaders('s', body);
    expect(verifySignature('s', h, body)).toBe(true);
    expect(verifySignature('s', h, body + ' ')).toBe(false);
    expect(verifySignature('other', h, body)).toBe(false);
    expect(verifySignature('', h, body)).toBe(false);
    expect(verifySignature('s', {}, body)).toBe(false);
  });

  it('rejects stale timestamps and malformed signatures', () => {
    const h = buildHeaders('s', body);
    expect(verifySignature('s', { ...h, [TIMESTAMP_HEADER]: String(Date.now() - 10 * 60 * 1000) }, body)).toBe(false);
    expect(verifySignature('s', { ...h, [SIGNATURE_HEADER]: 'zz' }, body)).toBe(false);
  });
});
