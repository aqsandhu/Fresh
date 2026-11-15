/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  collectCoverageFrom: [
    // The whole source — config/ and app.ts used to be left out.
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/migrations/**',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  // Ratchet floor: thresholds set just under what the real suite currently
  // achieves so CI fails on a REGRESSION, not on an aspirational target that
  // never passed. Raise these as coverage grows. (The previous 70% gate could
  // never pass on a 22k-line codebase and effectively disabled the check.)
  coverageThreshold: {
    // Ratchet (15 Nov 2026): one point under the measured coverage. Raise it
    // whenever coverage grows; CI fails if a change makes it fall.
    global: {
      branches: 14,
      functions: 26,
      lines: 27,
      statements: 26,
    },
  },
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
};
