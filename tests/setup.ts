// Jest Test Setup
// Global test configuration and setup

export {}; // Make this file a module

// Increase test timeout for CI environments
if (process.env.CI) {
  jest.setTimeout(120000); // 2 minutes for CI
} else {
  jest.setTimeout(60000); // 1 minute for local development
}

// Mock console methods to reduce noise in tests unless explicitly testing them
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Silence console output during tests unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  if (!process.env.VERBOSE_TESTS) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});

// Global cleanup
afterAll(() => {
  // Ensure all console methods are restored
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Add custom matchers if needed
expect.extend({
  toBeValidSemver(received: string) {
    const semverPattern = /^([\^~>=<]*)(\d+\.\d+\.\d+)(.*)$/;
    const pass = semverPattern.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid semver`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid semver`,
        pass: false,
      };
    }
  },
});

// Extend Jest matchers type
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSemver(): R;
    }
  }
}
