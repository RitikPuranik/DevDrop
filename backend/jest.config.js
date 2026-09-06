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
    '<rootDir>/tests/integration/**/*.test.js',
  ],
  collectCoverageFrom: [
    'src/**/*.js',
  ],
  // src/modules/*/index.js are pure one-line re-export barrels
  // (`module.exports = require('./x.routes')`) with zero executable
  // logic of their own — the routes file they re-export is already
  // measured directly. Excluding them stops the report from being
  // diluted by files that can never be meaningfully "covered".
  // src/services/deployment/analyzer/index.js is NOT excluded: unlike
  // the barrels, it contains real business logic (analyzeRepository)
  // and is intentionally still counted as untested surface area.
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '^<rootDir>/src/modules/[^/]+/index\\.js$',
  ],
  clearMocks: true,
  verbose: true,
};
