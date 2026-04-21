// ============================================================================
// JEST TEST SETUP
// ============================================================================
// This file runs before each test file. Configure global test utilities,
// mocks, and environment here.
// ============================================================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// Mock database queries
jest.mock('../config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn((cb: any) => cb({ query: jest.fn() })),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
  morganStream: { write: jest.fn() },
}));

// Mock Sentry
jest.mock('../config/sentry', () => ({
  initSentry: jest.fn(),
  setupSentryMiddleware: jest.fn(),
  setupSentryErrorHandler: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}));

// Global test timeout
jest.setTimeout(10000);

// Clean up after all tests
afterAll(async () => {
  jest.clearAllMocks();
});
