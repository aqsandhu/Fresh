module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>', '<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.tsx', '**/tests/**/*.test.ts'],
  // The whole site, pages (app/) included — they used to be left out, which
  // showed about 1.5 times the real coverage.
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'context/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'store/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
  // Ratchet floor: set just under the current suite's real coverage so
  // `pnpm test` fails on regressions instead of an aspirational target that the
  // existing tests do not exercise yet. Raise as website coverage grows.
  coverageThreshold: {
    // Ratchet (19 Nov 2026, W17): one point under the measured coverage
    // (61.1% statements, 62.0% lines, 58.8% functions, 50.0% branches). Raise
    // it whenever coverage grows; CI fails if a change makes it fall.
    global: {
      branches: 48,
      functions: 57,
      lines: 60,
      statements: 60,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/store/(.*)$': '<rootDir>/store/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/types/(.*)$': '<rootDir>/types/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        module: 'commonjs',
        moduleResolution: 'node',
      },
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
};
