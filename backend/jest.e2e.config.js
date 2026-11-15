/**
 * Real-database test run:  pnpm --filter @freshbazar/backend test:e2e
 *
 * The unit suite (jest.config.js) mocks the database, so it cannot see a query
 * Postgres rejects or a money rule that only breaks across tables — the kind
 * of bug every audit of this project has found. This run boots the REAL app in
 * the jest process against a REAL Postgres (E2E_DATABASE_URL — schema.sql +
 * all migrations applied) and drives it over HTTP, so the code the checks
 * execute is measured in the coverage report (coverage-e2e/).
 *
 * Without E2E_DATABASE_URL the suite is skipped (so `pnpm test` on a machine
 * with no database is unaffected).
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: ['**/*.e2e.ts'],
  transform: {
    // Transpile only: the typecheck job already type-checks the whole project.
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json', isolatedModules: true, diagnostics: false }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // The WHOLE source (config/ and app.ts too — they used to be left out, which
  // made the number look better than it was).
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/migrations/**', '!src/__tests__/**'],
  coverageDirectory: 'coverage-e2e',
  coverageReporters: ['text-summary', 'json-summary', 'json', 'lcov'],
  // Ratchet floor, a little under what the suite reaches today (43 % lines, 39 % functions,
  // whole source, 15 Nov 2026):
  // real-database coverage may grow, it may not silently shrink.
  coverageThreshold: { global: { lines: 42, statements: 39, functions: 37, branches: 21 } },
  testTimeout: 600000,
  maxWorkers: 1,
  // The app keeps its HTTP server, pool and schedulers alive by design.
  forceExit: true,
  verbose: true,
};
