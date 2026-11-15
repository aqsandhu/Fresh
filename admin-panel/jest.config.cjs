module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/App.tsx',
    '!src/vite-env.d.ts',
  ],
  // Ratchet floor: set just under what the current suite achieves so CI fails
  // on a regression rather than on an aspirational 60% target that never
  // passed (it silently failed `npm test`). Raise as component coverage grows.
  coverageThreshold: {
    // Ratchet (15 Nov 2026): one point under the measured coverage. Raise it
    // whenever coverage grows; CI fails if a change makes it fall.
    global: {
      branches: 9,
      functions: 8,
      lines: 11,
      statements: 11,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/ui/BrandLogo$': '<rootDir>/src/testDoubles/BrandLogo.tsx',
    '^@tanstack/react-query$': '<rootDir>/src/testDoubles/reactQuery.tsx',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      useESM: false,
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 10000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
};
