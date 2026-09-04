module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup/setupEnv.js'],
  // Centralized unit tests (backend/tests/unit/**) and centralized API
  // tests (backend/tests/api/**). Phase 2A moved the last remaining
  // in-source __tests__ folders out of src/, so that pattern is no
  // longer needed here.
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/api/**/*.test.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
  ],
  clearMocks: true,
  verbose: true,
};
