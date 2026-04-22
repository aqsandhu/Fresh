// ============================================================================
// SENTRY ERROR TRACKING & PERFORMANCE MONITORING
// ============================================================================
// Integrates Sentry for error tracking. Configure via SENTRY_DSN env var.
// Uses @sentry/node v8 API (Handlers removed in v8).
//
// Required environment variables:
//   SENTRY_DSN          - Sentry project DSN (required to enable)
//   SENTRY_ENVIRONMENT  - Environment tag (default: NODE_ENV)
//   SENTRY_TRACES_RATE  - Sample rate (default: 0.1)
// ============================================================================

import * as Sentry from '@sentry/node';
import { Application, Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Initialize Sentry for error tracking.
 * Does nothing if SENTRY_DSN is not set.
 */
export const initSentry = (): void => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not configured - error tracking disabled');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version || '1.0.0',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || '0.1'),
      sampleRate: 1.0,
      debug: process.env.NODE_ENV === 'development',
      attachStacktrace: true,
    });

    logger.info('Sentry initialized');
  } catch (error) {
    logger.error('Failed to initialize Sentry', { error });
  }
};

/**
 * Express middleware that wraps requests in Sentry spans.
 * Must be called BEFORE all routes.
 */
export const setupSentryMiddleware = (app: Application): void => {
  if (!process.env.SENTRY_DSN) return;

  // Simple request tracking middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    Sentry.addBreadcrumb({
      category: 'http',
      message: `${req.method} ${req.path}`,
      level: 'info',
    });
    next();
  });

  logger.info('Sentry middleware attached');
};

/**
 * Sentry error handler - captures exceptions and sends to Sentry.
 * Must be registered AFTER all routes.
 */
export const setupSentryErrorHandler = (app: Application): void => {
  if (!process.env.SENTRY_DSN) return;

  // Error handler middleware
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    Sentry.captureException(err);
    next(err);
  });

  logger.info('Sentry error handler attached');
};

/**
 * Manually capture an exception in Sentry.
 */
export const captureException = (error: Error, context?: Record<string, any>): void => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
};

/**
 * Manually capture a message in Sentry.
 */
export const captureMessage = (message: string, level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info'): void => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureMessage(message, level);
};

/**
 * Set user context for Sentry.
 */
export const setSentryUser = (user: { id: string; email?: string; phone?: string; role?: string }): void => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.phone,
    role: user.role,
  });
};

/**
 * Clear user context from Sentry.
 */
export const clearSentryUser = (): void => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser(null);
};

export default Sentry;
