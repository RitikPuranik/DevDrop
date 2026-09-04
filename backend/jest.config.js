module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setupEnv.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
  clearMocks: true,
  verbose: true,
};
