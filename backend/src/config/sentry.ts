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
import { redactLogValue, redactQueryString, redactString, redactUrl, summarizeForTracker } from '../utils/redact';

/**
 * Stricter than the logs, because this leaves for a third party: no phone
 * number, CNIC, email, password, code, token, cookie — and no free text the
 * customer typed (a door-photo upload used to send the whole form, home
 * address included). A JSON body keeps its field names and the shape of the
 * values; any other body (multipart uploads) is dropped.
 */
function redactBody(data: unknown): unknown {
  if (typeof data !== 'string') return summarizeForTracker(data);
  try {
    return JSON.stringify(summarizeForTracker(JSON.parse(data)));
  } catch {
    return `[non-JSON body not sent, ${data.length} chars]`;
  }
}

function redactQuery(q: unknown): unknown {
  if (typeof q === 'string') return redactQueryString(q, true);
  if (Array.isArray(q)) return q.map((pair) => (Array.isArray(pair) ? [pair[0], summarizeForTracker(pair[1], String(pair[0]))] : '[query]'));
  return summarizeForTracker(q);
}

export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    const { data, cookies, query_string: query, url, ...rest } = event.request;
    event.request = {
      ...(redactLogValue(rest) as typeof rest),
      ...(url ? { url: redactUrl(url, true) } : {}),
      ...(query !== undefined ? { query_string: redactQuery(query) as typeof query } : {}),
      ...(cookies ? { cookies: Object.fromEntries(Object.keys(cookies).map((k) => [k, '[redacted]'])) } : {}),
      ...(data !== undefined ? { data: redactBody(data) } : {}),
    };
  }
  if (event.extra) event.extra = redactLogValue(event.extra) as typeof event.extra;
  if (event.message) event.message = redactString(event.message);
  for (const v of event.exception?.values ?? []) {
    if (v.value) v.value = redactString(v.value);
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubSentryBreadcrumb);
  return event;
}

export function scrubSentryBreadcrumb(b: Sentry.Breadcrumb): Sentry.Breadcrumb {
  let data = b.data ? (redactLogValue(b.data) as Record<string, unknown>) : undefined;
  if (data) {
    // Outgoing HTTP calls (WhatsApp, Firebase, storage) carry their URL here.
    if (typeof data.url === 'string') data = { ...data, url: redactUrl(data.url, true) };
    if (typeof data['http.query'] === 'string') data = { ...data, 'http.query': redactQueryString(data['http.query'] as string, true) };
  }
  return {
    ...b,
    ...(b.message ? { message: redactUrl(b.message, true) } : {}),
    ...(data ? { data } : {}),
  };
}

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
      sendDefaultPii: false,
      beforeSend: (event) => scrubSentryEvent(event),
      beforeSendTransaction: (event) => scrubSentryEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
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

  // Error handler middleware. Report ONLY genuine server errors (5xx). Expected
  // client errors — 401 (missing/expired token), 403, 404, 422 validation — are
  // normal traffic and must NOT flood Sentry; an error without a statusCode is
  // treated as 500 (truly unexpected). This is the single capture point.
  app.use((err: any, req: Request, _res: Response, next: NextFunction) => {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('path', req.path);
        scope.setTag('method', req.method);
        const requestId = (req as { requestId?: string }).requestId;
        if (requestId) scope.setTag('request_id', requestId);
        const userId = (req as { user?: { id?: string } }).user?.id;
        if (userId) scope.setUser({ id: userId });
        Sentry.captureException(err);
      });
    }
    next(err);
  });

  logger.info('Sentry error handler attached (5xx only)');
};

/**
 * Manually capture an exception in Sentry.
 */
export const captureException = (error: Error, context?: Record<string, unknown>): void => {
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
 * PRIVACY: only the opaque user id is sent — email/phone (PII) must never
 * leave for a third-party error tracker. The email/phone/role params are
 * accepted for call-site compatibility but deliberately ignored.
 */
export const setSentryUser = (user: { id: string; email?: string; phone?: string; role?: string }): void => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser({ id: user.id });
};

/**
 * Clear user context from Sentry.
 */
export const clearSentryUser = (): void => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser(null);
};

export default Sentry;
