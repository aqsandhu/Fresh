// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore, { type SendCommandFn } from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import logger from '../utils/logger';

const isDev = process.env.NODE_ENV !== 'production';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isDev ? '10000' : '100'));
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000');
const AUTH_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || (isDev ? '1000' : '50'));

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

/**
 * Build a Redis-backed store with a per-limiter prefix so different limiters
 * don't share a counter. Falls back to in-memory when REDIS_URL isn't set.
 *
 * SECURITY FIX: previously only authRedisStore existed. Order, admin,
 * password-reset, etc. were per-instance in-memory limits — easily reset by
 * a restart and trivially bypassed across multiple instances.
 */
function makeStore(prefix: string) {
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: ((...args: string[]) =>
      redis.call(...(args as [string, ...string[]]))) as SendCommandFn,
  });
}

const authRedisStore = makeStore('auth');
const registerRedisStore = makeStore('register');
const apiRedisStore = makeStore('api');
const adminRedisStore = makeStore('admin');
const orderRedisStore = makeStore('order');
const webhookRedisStore = makeStore('webhook');
const passwordResetRedisStore = makeStore('pwreset');
const riderLocationRedisStore = makeStore('riderloc');

function skipInDev(req: Request): boolean {
  if (!isDev) return false;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

export async function initRateLimiterStore(): Promise<void> {
  if (redis) {
    try {
      await redis.ping();
      logger.info('Redis connected for auth/register rate limiting');
    } catch (err) {
      logger.warn('Redis ping failed — auth/register limiters fall back to in-memory', { err });
    }
  }
}

export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  skip: skipInDev,
  store: apiRedisStore,
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

export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: AUTH_MAX_REQUESTS,
  skip: skipInDev,
  store: authRedisStore,
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

export const registerRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 3,
  skip: skipInDev,
  store: registerRedisStore,
  message: {
    success: false,
    message: 'Too many registration attempts from this IP, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const passwordResetRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isDev ? 100 : 3,
  skip: skipInDev,
  store: passwordResetRedisStore,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 30,
  skip: skipInDev,
  store: adminRedisStore,
  message: {
    success: false,
    message: 'Too many admin actions, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const riderLocationRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 1000,
  max: isDev ? 100 : 1,
  skip: skipInDev,
  store: riderLocationRedisStore,
  message: {
    success: false,
    message: 'Location updates too frequent',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const orderRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 100 : 5,
  skip: skipInDev,
  store: orderRedisStore,
  message: {
    success: false,
    message: 'Too many order attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,
  skip: skipInDev,
  store: webhookRedisStore,
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
): RateLimitRequestHandler => {
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
