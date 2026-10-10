module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/setupEnv.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  clearMocks: true,
  verbose: true,
};
