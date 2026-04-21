// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { captureException, clearSentryUser } from '../config/sentry';

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
  _next: NextFunction
): void => {
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

  // Send error to Sentry (non-blocking)
  if (statusCode >= 500) {
    captureException(err instanceof Error ? err : new Error(String(err)), {
      path: req.path,
      method: req.method,
      statusCode,
      userId: (req as any).user?.id,
    });
  }

  // Clear Sentry user context after request
  clearSentryUser();

  // Log error
  logger.error('Error occurred', {
    message: err.message,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack,
  });

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
    // In production, you might want to exit and let PM2 restart
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
};

// Uncaught exception handler
export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    // In production, exit and let PM2 restart
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });
};
