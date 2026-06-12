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
};
