module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs'
      }
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts' // Usually just re-exports
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  // Coverage thresholds disabled for CLI tool - integration tests are more valuable than coverage
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 45000,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // Global test settings
  maxWorkers: '50%',
  detectOpenHandles: true,
  forceExit: false
};
