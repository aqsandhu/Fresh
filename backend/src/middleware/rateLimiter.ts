// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { TooManyRequestsError } from './errorHandler';

const isDev = process.env.NODE_ENV !== 'production';

// Get window and max from environment or use defaults
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isDev ? '10000' : '100'));
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const AUTH_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || (isDev ? '1000' : '50'));

// Skip rate limiting for localhost in development
function skipInDev(req: Request): boolean {
  if (!isDev) return false;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later',
      retryAfter: Math.ceil(WINDOW_MS / 1000),
    });
  },
});

// Strict rate limiter for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_REQUESTS,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again after 15 minutes',
      retryAfter: Math.ceil(AUTH_WINDOW_MS / 1000),
    });
  },
});

// Registration rate limiter
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDev ? 100 : 3,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset rate limiter
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDev ? 100 : 3,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin action rate limiter
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 1000 : 30,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many admin actions, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rider location update rate limiter
export const riderLocationRateLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 seconds
  max: isDev ? 100 : 1,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Location updates too frequent',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Order creation rate limiter
export const orderRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 100 : 5,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Too many order attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook rate limiter (more lenient for external services)
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 1000 : 100,
  skip: skipInDev,
  message: {
    success: false,
    message: 'Webhook rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Custom rate limiter factory
export const createRateLimiter = (
  windowMs: number,
  max: number,
  message: string
) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};
