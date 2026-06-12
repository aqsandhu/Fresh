// ============================================================================
// INTEGRATION TEST HELPERS
// ============================================================================
// Mount the REAL Express routers with the real middleware chain (auth,
// validation, error handler) and only the database layer mocked (see
// tests/setup.ts). This exercises genuine request → middleware → controller
// behaviour, unlike a mock that asserts on its own return value.

import express, { type Express, type Router } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

import { errorHandler } from '@/middleware/errorHandler';

/** Build a minimal app mounting a real router under basePath + the error handler. */
export function buildApp(basePath: string, router: Router): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use(basePath, router);
  app.use(errorHandler);
  return app;
}

export function signAccessToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: 'user-1', phone: '+923001234567', role: 'customer', ...overrides },
    process.env.JWT_SECRET as string,
    { expiresIn: '15m' }
  );
}

export function signRefreshToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { userId: 'user-1', phone: '+923001234567', role: 'customer', type: 'refresh', ...overrides },
    process.env.JWT_REFRESH_SECRET as string,
    { expiresIn: '7d' }
  );
}
