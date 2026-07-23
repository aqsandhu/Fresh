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
  errors: any[];
  
  constructor(message: string = 'Validation failed', errors: any[] = []) {
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
  error?: any;
  stack?: string;
}

// Main error handler middleware
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Response already started (torn connection / streaming handler): writing
  // again would throw 'Cannot set headers after they are sent' — defer to the
  // Express default handler instead.
  if (res.headersSent) {
    next(err);
    return;
  }

  let statusCode = 500;
  let message = 'Internal server error';
  let errorDetails: any = null;

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
    message: `Route ${req.originalUrl} not found`,
  });
};

// Async handler wrapper
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Unhandled rejection handler (for process-level errors)
export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
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
