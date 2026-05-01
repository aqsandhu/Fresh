// ============================================================================
// JEST TEST SETUP
// ============================================================================

import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'freshbazar_test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.CORS_CREDENTIALS = 'true';

// ============================================================================
// MOCK EXTERNAL SERVICES
// ============================================================================

// Mock Sentry
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  configureScope: jest.fn(),
  withScope: jest.fn(),
  Integrations: {
    Http: class HttpIntegration {},
    OnUncaughtException: class OnUncaughtExceptionIntegration {},
    OnUnhandledRejection: class OnUnhandledRejectionIntegration {},
  },
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn().mockReturnValue({}),
  credential: {
    cert: jest.fn(),
  },
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'test-uid',
      phone_number: '+923001234567',
    }),
  }),
}));

// Mock Firebase Auth Service
jest.mock('@/services/otp.service', () => ({
  verifyFirebaseToken: jest.fn().mockResolvedValue({ success: true, phone: '+923001234567', message: 'Token verified' }),
}));

// Mock logger to reduce test noise
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  morganStream: {
    write: jest.fn(),
  },
}));

// Mock database
jest.mock('@/config/database', () => ({
  query: jest.fn(),
  withTransaction: jest.fn((callback) => callback({ query: jest.fn() })),
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// GLOBAL TEST LIFECYCLE
// ============================================================================

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterAll(async () => {
  // Clean up any remaining handles
  await new Promise((resolve) => setTimeout(resolve, 500));
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled Rejection in test:', reason);
});
