const jwt = require('jsonwebtoken');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../../src/shared/utils/jwt');

describe('jwt utils', () => {
  const userId = 'user-123';

  it('generates an access token that verifies back to the same userId', () => {
    const token = generateAccessToken(userId);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(userId);
  });

  it('generates a refresh token that verifies back to the same userId', () => {
    const token = generateRefreshToken(userId);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(userId);
  });

  it('access and refresh tokens are signed with different secrets and are not interchangeable', () => {
    const accessToken = generateAccessToken(userId);
    expect(() => verifyRefreshToken(accessToken)).toThrow('Invalid or expired refresh token');
  });

  it('rejects a tampered token', () => {
    const token = generateAccessToken(userId);
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    expect(() => verifyAccessToken(tampered)).toThrow('Invalid or expired token');
  });

  it('rejects an expired access token', () => {
    const expired = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow('Invalid or expired token');
  });

  it('rejects a garbage string', () => {
    expect(() => verifyAccessToken('not-a-real-token')).toThrow();
  });
});
