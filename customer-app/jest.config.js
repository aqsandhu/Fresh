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
};
