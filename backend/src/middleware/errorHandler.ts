// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { clearSentryUser, captureException } from '../config/sentry';

// Custom API Error class
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export class BadRequestError extends ApiError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Not found') {
    super(message, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

export class ValidationError extends ApiError {
  errors: unknown[];
  
  constructor(message: string = 'Validation failed', errors: unknown[] = []) {
    super(message, 422);
    this.errors = errors;
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message: string = 'Too many requests') {
    super(message, 429);
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  message: string;
  requestId?: string;
  error?: unknown;
  stack?: string;
}

// Main error handler middleware
export const errorHandler = (
  rawErr: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Response already started (torn connection / streaming handler): writing
  // again would throw 'Cannot set headers after they are sent' — defer to the
  // Express default handler instead.
  if (res.headersSent) {
    next(rawErr);
    return;
  }
  // Not an error: the entry waits for the city admin's approval (J1).
  // Nothing was applied (the action's transaction was rolled back).
  const queued = rawErr as unknown as { queued?: boolean; requestId?: string; message?: string };
  if (queued?.queued === true) {
    res.status(202).json({ success: true, message: queued.message, data: { queued: true, request_id: queued.requestId } });
    return;
  }

  // Same translation as asyncHandler, for errors raised in plain middleware.
  const err: Error | ApiError = clientInputError(rawErr, req) ?? rawErr;

  let statusCode = 500;
  let message = 'Internal server error';
  let errorDetails: unknown = null;

  // Handle known error types
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    
    if (err instanceof ValidationError && err.errors.length > 0) {
      errorDetails = err.errors;
    }
  } else if (err.name === 'ValidationError') {
    // Mongoose validation error (if used)
    statusCode = 422;
    message = 'Validation failed';
    errorDetails = err.message;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // JSON parse error
    statusCode = 400;
    message = 'Invalid JSON';
  } else if ((err as { type?: string }).type === 'entity.too.large') {
    // body-parser: request body over the size limit (was a 500).
    statusCode = 413;
    message = 'The request is too large.';
  } else if (err.name === 'MulterError') {
    // File upload limits. Only the address routes had their own handler —
    // everywhere else (products, riders, proofs, waste...) a picture over
    // the limit or under the wrong field name answered 500.
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      const mb = Math.round(parseInt(process.env.MAX_FILE_SIZE || '5242880', 10) / 1024 / 1024);
      message = `The picture is too large. The largest allowed is ${mb} MB.`;
    } else if (code === 'LIMIT_FILE_COUNT') {
      statusCode = 400;
      message = 'Too many files in one request.';
    } else if (code === 'LIMIT_UNEXPECTED_FILE') {
      statusCode = 400;
      message = 'The file was sent under an unexpected field name.';
    } else {
      statusCode = 400;
      message = 'The upload could not be read.';
    }
  }

  // Error reporting to Sentry happens once, in setupSentryErrorHandler (5xx only,
  // with request context) — runs before this handler. We only clear the
  // per-request Sentry user context here.
  clearSentryUser();

  // Log error — skip noisy stack traces for expected auth failures.
  const isExpectedAuthFailure =
    statusCode === 401 &&
    (message === 'Token expired' ||
      message === 'Invalid token' ||
      message === 'Access token required');

  const isExpectedPermissionDenial =
    statusCode === 403 &&
    message === 'You do not have permission to perform this action';

  if (isExpectedAuthFailure) {
    logger.warn('Auth failure', {
      message,
      statusCode,
      path: req.path,
      method: req.method,
    });
  } else if (isExpectedPermissionDenial) {
    logger.warn('Permission denied', {
      message,
      statusCode,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
    });
  } else {
    logger.error('Error occurred', {
      requestId: req.requestId,
      message: err.message,
      statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
      ...(errorDetails ? { validationErrors: errorDetails } : {}),
      stack: err.stack,
    });
  }

  // Build response
  const response: ErrorResponse = {
    success: false,
    message,
  };
  // A server fault carries the request id, so "it failed" can be traced to
  // the exact log lines (the id is also on every response as X-Request-Id).
  if (statusCode >= 500 && req.requestId) {
    response.requestId = req.requestId;
  }

  if (errorDetails) {
    response.error = errorDetails;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    // Path only: the query string is whatever the caller sent (a token or
    // phone number in the wrong place must not be echoed back).
    message: `Route ${(req.originalUrl || req.url || '').split('?')[0]} not found`,
  });
};

/**
 * A malformed id typed into the URL ("/orders/not-a-uuid") or sent in a body
 * reaches Postgres as `WHERE id = $1` and comes back as SQLSTATE 22P02 —
 * which used to surface as a 500 on most by-id endpoints. That is the
 * caller's mistake, not a server fault: answer 404 for a bad path id and 400
 * for a bad value elsewhere.
 *
 * Only translated when the rejected value really came from THIS request, so a
 * genuine bug in our own SQL (a bad literal we wrote) still shows up as a 500
 * and reaches error monitoring.
 */
export function clientInputError(err: any, req: Request): ApiError | null {
  // G36: a number too big for its column (SQLSTATE 22003) — a typo like
  // 1,000,000,000,000 in a money box. Only when the request itself carries a
  // huge number; an overflow of our own making stays a 500. A phone number
  // ("03…", "+92…") is not a number here.
  if (err && err.code === '22003') {
    const huge = (v: unknown, depth = 0): boolean => {
      if (typeof v === 'number') return Number.isFinite(v) ? Math.abs(v) >= 1e6 : true;
      if (typeof v === 'string') return /^-?[1-9]\d*(\.\d+)?(e\+?\d+)?$/i.test(v.trim()) && Math.abs(Number(v)) >= 1e6;
      if (v && typeof v === 'object' && depth < 4) return Object.values(v as Record<string, unknown>).some((x) => huge(x, depth + 1));
      return false;
    };
    if (huge(req.body) || huge(req.query)) {
      return new BadRequestError('One of the numbers sent is too large — please check it.');
    }
    return null;
  }
  // G37: other refusals the request itself caused. Each is translated only when
  // the problem is really in the request — otherwise it is our bug (500).
  const sentStrings = (v: unknown, depth = 0, out: string[] = []): string[] => {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object' && depth < 4) Object.values(v as Record<string, unknown>).forEach((x) => sentStrings(x, depth + 1, out));
    return out;
  };
  if (err && err.code === '22001') {
    // value too long for type character varying(N)
    const max = Number(/character varying\((\d+)\)/.exec(String(err.message))?.[1] || 0);
    if (max && [...sentStrings(req.body), ...sentStrings(req.query)].some((s) => s.length > max)) {
      return new BadRequestError(`One of the texts is too long (at most ${max} characters).`);
    }
    return null;
  }
  if (err && err.code === '22021') {
    // invalid byte sequence — a NUL character, which Postgres text cannot hold
    if ([...sentStrings(req.body), ...sentStrings(req.query)].some((s) => s.includes('\u0000'))) {
      return new BadRequestError('One of the texts contains a character that cannot be saved.');
    }
    return null;
  }
  if (err && err.code === '23502') {
    // a required column left empty: the caller's mistake only if they did not send it
    const col = String(err.column || /column "([^"]+)"/.exec(String(err.message))?.[1] || '');
    if (col) {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const camel = col.replace(/_([a-z])/g, (_m: string, ch: string) => ch.toUpperCase());
      const sent = [col, camel].some((k) => body[k] !== undefined && body[k] !== null && body[k] !== '');
      if (!sent) return new BadRequestError(`${col} is required.`);
    }
    return null;
  }
  if (!err || err.code !== '22P02' || typeof err.message !== 'string') return null;
  const m = /invalid input syntax for type (uuid|integer|bigint|numeric|smallint): "([\s\S]*)"$/i.exec(err.message)
    // a status (enum) the list does not know — ?status=% (G37, query fuzz)
    ?? /invalid input value for enum (\w+): "([\s\S]*)"$/i.exec(err.message);
  if (!m) return null;
  const rejected = m[2];
  const has = (bag: unknown, depth = 0): boolean => {
    if (bag === null || bag === undefined) return false;
    if (typeof bag === 'string' || typeof bag === 'number') return String(bag) === rejected;
    if (typeof bag !== 'object' || depth > 3) return false;
    return Object.values(bag as Record<string, unknown>).some((v) => has(v, depth + 1));
  };
  if (has(req.params)) return new NotFoundError('Not found');
  // The matched route's params are not always visible here (router-level
  // middleware): fall back to the path segments themselves.
  const decode = (seg: string) => { try { return decodeURIComponent(seg); } catch { return seg; } };
  if (String(req.path || '').split('/').some((seg) => seg && decode(seg) === rejected)) {
    return new NotFoundError('Not found');
  }
  if (has(req.query) || has(req.body) || has(req.headers['x-city-id'])) {
    return new BadRequestError('One of the values sent is not valid.');
  }
  return null;
}

// Async handler wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(clientInputError(err, req) ?? err));
  };
};

// Unhandled rejection handler (for process-level errors)
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled Rejection', { reason, promise });
    // Report, DON'T exit: exiting here dropped every in-flight request
    // (orders included) for one stray fire-and-forget rejection — under load
    // that was the most realistic self-inflicted outage. A rejected promise
    // has not corrupted the process state the way a synchronous throw can,
    // so alerting is the right response, not a restart.
    captureException(
      reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`),
      { source: 'unhandledRejection' }
    );
  });
};

// Uncaught exception handler
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    captureException(error, { source: 'uncaughtException' });
    // A synchronous throw leaves the process in an unknown state — exit and
    // let the platform (Render) restart. The short delay lets Sentry/logs
    // flush so the crash is never invisible.
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => process.exit(1), 2000);
    }
  });
};
