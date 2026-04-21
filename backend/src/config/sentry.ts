// ============================================================================
// SENTRY ERROR TRACKING & PERFORMANCE MONITORING
// ============================================================================
// Integrates Sentry for error tracking, performance monitoring, and session
// replay. Configure via SENTRY_DSN environment variable.
//
// Required environment variables:
//   SENTRY_DSN          - Sentry project DSN (required to enable)
//   SENTRY_ENVIRONMENT  - Environment tag (default: NODE_ENV or 'development')
//   SENTRY_RELEASE      - Release version (default: package version)
//   SENTRY_TRACES_RATE  - Sample rate for performance traces (default: 0.1)
// ============================================================================

import * as Sentry from '@sentry/node';
import { Express } from 'express';
import logger from '../utils/logger';

/**
 * Initialize Sentry for error tracking and performance monitoring.
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

      // Performance monitoring
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || '0.1'),

      // Error sampling
      sampleRate: 1.0,

      // Enable debug in development
      debug: process.env.NODE_ENV === 'development',

      // Attach stack traces
      attachStacktrace: true,

      // Before sending, filter out sensitive data
      beforeSend(event) {
        // Redact sensitive headers
        if (event.request?.headers) {
          const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'password'];
          for (const header of Object.keys(event.request.headers)) {
            if (sensitiveHeaders.some((sh) => header.toLowerCase().includes(sh))) {
              event.request.headers[header] = '[REDACTED]';
            }
          }
        }

        // Redact sensitive query params
        if (event.request?.query_string) {
          const sensitiveParams = ['token', 'password', 'secret', 'api_key'];
          if (typeof event.request.query_string === 'string') {
            // Already a string, leave as-is
          } else if (typeof event.request.query_string === 'object') {
            for (const key of Object.keys(event.request.query_string)) {
              if (sensitiveParams.some((sp) => key.toLowerCase().includes(sp))) {
                event.request.query_string[key] = '[REDACTED]';
              }
            }
          }
        }

        return event;
      },
    });

    logger.info('Sentry initialized', {
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    logger.error('Failed to initialize Sentry', { error });
  }
};

/**
 * Setup Sentry request handler and error handler in Express app.
 * Must be called BEFORE all routes (for request handler)
 * and AFTER all routes (for error handler).
 */
export const setupSentryMiddleware = (app: Express): void => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    return;
  }

  // Request handler - must be the first middleware
  app.use(Sentry.Handlers.requestHandler());

  // Tracing handler - creates spans for performance monitoring
  app.use(Sentry.Handlers.tracingHandler());

  logger.info('Sentry request handlers attached');
};

/**
 * Sentry error handler - must be registered AFTER all routes and
 * BEFORE the regular error handler middleware.
 */
export const setupSentryErrorHandler = (app: Express): void => {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    return;
  }

  // Error handler - captures exceptions and sends to Sentry
  app.use(Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture all 500+ errors
      if ((error as any)?.statusCode >= 500) {
        return true;
      }
      // Capture operational errors that shouldn't happen
      if ((error as any)?.isOperational === false) {
        return true;
      }
      // Capture all unhandled errors
      return true;
    },
  }));

  logger.info('Sentry error handler attached');
};

/**
 * Manually capture an exception in Sentry.
 * Use this for non-HTTP errors (background jobs, scheduled tasks, etc.)
 */
export const captureException = (error: Error, context?: Record<string, any>): void => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

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
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info'): void => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.captureMessage(message, level);
};

/**
 * Set user context for Sentry.
 * Associates subsequent events with the given user.
 */
export const setSentryUser = (user: { id: string; email?: string; phone?: string; role?: string }): void => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.phone,
    ...user,
  });
};

/**
 * Clear user context from Sentry.
 * Call this after request processing is complete.
 */
export const clearSentryUser = (): void => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.setUser(null);
};

export default Sentry;
