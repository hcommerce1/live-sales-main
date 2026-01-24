/**
 * Jest Setup File
 *
 * Runs before each test file.
 * Sets up mocks and global test utilities.
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Silence console during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
