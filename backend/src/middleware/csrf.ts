// ============================================================================
// CSRF / ORIGIN VALIDATION MIDDLEWARE
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const NODE_ENV = process.env.NODE_ENV || 'development';

// Allowed origins from environment
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');

/**
 * Validate Origin header for state-changing (non-GET) requests.
 * This provides basic CSRF protection by ensuring cross-origin POST/PUT/PATCH/DELETE
 * requests come from an allowed origin.
 */
export const validateOrigin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip in development if explicitly disabled
  if (NODE_ENV === 'development' && process.env.DISABLE_ORIGIN_CHECK === 'true') {
    return next();
  }

  // Only enforce for state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Allow requests with no origin (mobile apps, server-to-server, curl)
  if (!origin) {
    // For browser-based requests, referer should be present
    // If neither origin nor referer, let downstream auth handle it
    return next();
  }

  // Check if origin is in allowed list
  const isAllowed = allowedOrigins.some((allowed) => {
    if (allowed.includes('*')) {
      const regex = new RegExp(allowed.replace(/\*/g, '.*'));
      return regex.test(origin);
    }
    return origin === allowed || origin.startsWith(allowed);
  });

  if (!isAllowed && NODE_ENV !== 'development') {
    logger.warn('Origin validation failed', {
      origin,
      referer,
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    res.status(403).json({
      success: false,
      message: 'Invalid origin. CSRF protection triggered.',
    });
    return;
  }

  next();
};
