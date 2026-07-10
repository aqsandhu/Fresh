// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore, { type SendCommandFn } from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import logger from '../utils/logger';
import { captureMessage } from '../config/sentry';

const isDev = process.env.NODE_ENV !== 'production';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isDev ? '10000' : '100'));
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000');
const AUTH_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || (isDev ? '1000' : '50'));

// maxRetriesPerRequest keeps a Redis outage from hanging every rate-limited
// request while ioredis retries forever — commands fail after 2 reconnect
// attempts and the limiter fails OPEN (passOnStoreError below).
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 })
  : null;

// A Redis outage used to degrade the limiters SILENTLY (a single logger.warn
// at boot). Alert loudly — but at most once per interval so a flapping
// connection doesn't flood Sentry with thousands of duplicate events.
const REDIS_ALERT_INTERVAL_MS = 5 * 60 * 1000;
let lastRedisAlertAt = 0;
function alertRedisDegraded(context: string, err?: unknown): void {
  const now = Date.now();
  if (now - lastRedisAlertAt < REDIS_ALERT_INTERVAL_MS) return;
  lastRedisAlertAt = now;
  const message = `Rate limiter Redis unavailable (${context}) — limits degraded (fail-open, per-instance)`;
  logger.error(message, { err });
  captureMessage(message, 'error');
}

redis?.on('error', (err: Error) => alertRedisDegraded('connection error', err));

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
    sendCommand: (async (...args: string[]) => {
      try {
        return await redis.call(...(args as [string, ...string[]]));
      } catch (err) {
        alertRedisDegraded('command failed', err);
        // passOnStoreError on every limiter turns this into fail-open: the
        // request proceeds unthrottled instead of 500ing the whole API.
        throw err;
      }
    }) as SendCommandFn,
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
  if (!redis) {
    if (!isDev) {
      const message =
        'REDIS_URL not set in production — rate limits and lockouts are per-instance ' +
        'in-memory (reset on every restart; not shared across instances)';
      logger.warn(message);
      captureMessage(message, 'warning');
    }
    return;
  }
  try {
    await redis.ping();
    logger.info('Redis connected for rate limiting');
  } catch (err) {
    alertRedisDegraded('startup ping failed', err);
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
});

export const riderLocationRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 1000,
  max: isDev ? 100 : 4,
  skip: skipInDev,
  store: riderLocationRedisStore,
  message: {
    success: false,
    message: 'Location updates too frequent',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
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
