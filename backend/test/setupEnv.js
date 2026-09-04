// Deterministic env vars for tests — never read the real .env file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRE = '7d';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.JWT_REFRESH_EXPIRE = '30d';
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex
process.env.PLATFORM_FEE_AMOUNT = '500';
process.env.TAX_PERCENTAGE = '18';
process.env.EXCLUSIVE_COMMISSION_PERCENTAGE = '20';
