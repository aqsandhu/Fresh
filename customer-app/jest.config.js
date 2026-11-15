module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // tsconfig maps `react` → @types/react so `tsc` resolves a single @types/react
  // copy (fixes the React 18/19 skew from the shared monorepo). jest-expo turns
  // tsconfig paths into moduleNameMapper, which would wrongly point the RUNTIME
  // `react` import at the types folder — remap it back to the real package.
  moduleNameMapper: {
    '^react$': require.resolve('react'),
  },
  // RN renders can exceed jest's 5s default when suites run in parallel
  // (turbo/CI) — a real hang still fails, just later.
  testTimeout: 15000,
  // Every source file counts — without this only files a test happens to
  // load were measured, which showed 2–3 times the real coverage.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Ratchet (15 Nov 2026): one point under the measured coverage. Raise it
  // whenever coverage grows; CI fails if a change makes it fall.
  coverageThreshold: {
    global: {
      branches: 17,
      functions: 16,
      lines: 21,
      statements: 20,
    },
  },
};
