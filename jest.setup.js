/**
 * Jest Setup File
 * Runs before all tests to configure the test environment
 */

// Increase Jest timeout for slower tests
jest.setTimeout(30000);

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Setup environment variables for testing
process.env.NODE_ENV = 'test';

// Mock external services if needed
// jest.mock('./path/to/external/service');

console.log('🧪 Jest test environment initialized');
