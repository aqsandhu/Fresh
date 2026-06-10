// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { getRedisClient } from '../config/redis';
import logger from '../utils/logger';

const isDev = process.env.NODE_ENV !== 'production';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isDev ? '10000' : '100'));
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000');
const AUTH_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || (isDev ? '1000' : '50'));

function skipInDev(req: Request): boolean {
  if (!isDev) return false;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function buildStore() {
  const redis = getRedisClient();
  if (!redis) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisStore = require('rate-limit-redis').default;
    return new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    });
  } catch (err) {
    logger.warn('rate-limit-redis unavailable — using in-memory store', { err });
    return undefined;
  }
}

const sharedStore = buildStore();
const storeOptions = sharedStore ? { store: sharedStore } : {};

export async function initRateLimiterStore(): Promise<void> {
  getRedisClient();
}

export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  skip: skipInDev,
  ...storeOptions,
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

export const authRateLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_REQUESTS,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again after 15 minutes',
      retryAfter: Math.ceil(AUTH_WINDOW_MS / 1000),
    });
  },
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 3,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 3,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 30,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Too many admin actions, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const riderLocationRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: isDev ? 100 : 1,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Location updates too frequent',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const orderRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 100 : 5,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Too many order attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,
  skip: skipInDev,
  ...storeOptions,
  message: {
    success: false,
    message: 'Webhook rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const createRateLimiter = (
  windowMs: number,
  max: number,
  message: string
) => {
  return rateLimit({
    windowMs,
    max,
    ...storeOptions,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};
