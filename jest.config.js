/**
 * Jest Configuration
 * Configuration for running tests with Jest
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Ignore ES modules that cause issues
  transformIgnorePatterns: [
    'node_modules/(?!(baileys|@whiskeysockets)/)'
  ],

  // Module name mapper for ES modules
  moduleNameMapper: {
    '^baileys$': '<rootDir>/__mocks__/baileys.js'
  },

  // Coverage configuration
  collectCoverageFrom: [
    'routes/**/*.js',
    'middlewares/**/*.js',
    'functions/**/*.js',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/test/**',
    '!**/__tests__/**',
    '!**/__mocks__/**'
  ],

  // Coverage thresholds (optional)
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50
    }
  },

  // Test timeout (30 seconds for API tests)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: false,

  // Clear mocks between tests
  clearMocks: true,

  // Reset mocks between tests
  resetMocks: false,

  // Restore mocks between tests
  restoreMocks: false,

  // Maximum number of workers
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
