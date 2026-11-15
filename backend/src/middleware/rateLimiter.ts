// ============================================================================
// RATE LIMITING MIDDLEWARE
// ============================================================================

import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore, { type SendCommandFn } from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import crypto from 'crypto';
import { getRefreshTokenFromRequest } from '../utils/authCookies';
import logger from '../utils/logger';
import { captureMessage } from '../config/sentry';

const isDev = process.env.NODE_ENV !== 'production';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
// The global limiter is intentionally generous: Pakistani mobile carriers use
// CGNAT, so many unrelated customers share one public IP. Sensitive auth/order
// routes retain their much tighter dedicated limiters below.
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (isDev ? '10000' : '2000'));
const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000');
// Counts FAILED attempts only (skipSuccessfulRequests) and shares one bucket
// per CGNAT IP, so 50 wrong PINs across a whole carrier block locked everyone
// out. The per-ACCOUNT lockout (config/pinLockout.ts) is the real brute-force
// defence; this stays as a coarse per-IP brake.
const AUTH_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || (isDev ? '1000' : '150'));
// Registration / OTP send are per-IP too, but each attempt already burns a
// per-PHONE OTP quota (otpStore) — the IP caps only need to stop bulk abuse,
// not throttle a carrier's shared address. Env-tunable for launch traffic.
const REGISTER_MAX_REQUESTS = parseInt(process.env.REGISTER_RATE_LIMIT_MAX || (isDev ? '100' : '30'));
const OTP_MAX_REQUESTS = parseInt(process.env.OTP_RATE_LIMIT_MAX || (isDev ? '1000' : '100'));

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
const trackingRedisStore = makeStore('tracking');
const otpRedisStore = makeStore('otp');
const refreshRedisStore = makeStore('refresh');

function skipInDev(req: Request): boolean {
  if (!isDev) return false;
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

/**
 * Key an AUTHENTICATED limiter by user id, falling back to the client IP.
 * Pakistani mobile carriers (Jazz/Zong/Telenor) put thousands of unrelated
 * customers behind one CGNAT address, so an IP-keyed order limiter let six
 * neighbours on the same carrier lock each other out of checkout. A per-user
 * key can never be shared between customers; IP remains the fallback for
 * routes that run before authentication.
 */
export function userOrIpKey(req: Request): string {
  return req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip ?? '');
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

/**
 * The session a request belongs to: a hash of the access token it carries
 * (Bearer header or the `token` cookie), or null for an anonymous request.
 * Anyone can send a made-up token, so a limiter keyed by this is ALWAYS paired
 * with a per-IP ceiling.
 */
export function sessionKey(req: Request): string | null {
  const header = req.headers.authorization;
  const bearer = typeof header === 'string' && /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '') : undefined;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.token;
  const token = bearer || cookie;
  return typeof token === 'string' && token.length >= 20
    ? `tk:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`
    : null;
}

/**
 * Busy READ traffic is limited in two layers (same idea as the refresh limit):
 *  • per SESSION for signed-in callers — the normal budget;
 *  • per IP, a high ceiling only — it stops floods from one address.
 * A per-IP budget alone counted many customers as one: Pakistani mobile
 * carriers put thousands of phones behind one address (CGNAT), and every
 * website call reaches the API through Vercel's proxy, i.e. from a handful of
 * Vercel addresses. The old 2,000 per 15 min (and 60 product calls a minute)
 * per IP was therefore a limit for ALL website visitors together.
 */
export function twoLayerLimiter(opts: {
  name: string;
  windowMs: number;
  perSession: number;
  perIp: number;
  message: string;
  store?: ReturnType<typeof makeStore>;
  ipStore?: ReturnType<typeof makeStore>;
}): RateLimitRequestHandler[] {
  const reply = (res: Response) =>
    res.status(429).json({ success: false, message: opts.message, retryAfter: Math.ceil(opts.windowMs / 1000) });
  const perIp = rateLimit({
    windowMs: opts.windowMs,
    max: opts.perIp,
    skip: skipInDev,
    store: opts.ipStore,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    handler: (_req: Request, res: Response) => reply(res),
  });
  const perSession = rateLimit({
    windowMs: opts.windowMs,
    max: opts.perSession,
    // Anonymous requests are only under the per-IP ceiling.
    skip: (req: Request) => skipInDev(req) || sessionKey(req) === null,
    keyGenerator: (req: Request) => sessionKey(req) ?? ipKeyGenerator(req.ip ?? ''),
    store: opts.store,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    handler: (_req: Request, res: Response) => reply(res),
  });
  return [perIp, perSession];
}

const API_MAX_PER_IP = isDev ? 100000 : Math.max(MAX_REQUESTS, Number(process.env.API_MAX_PER_IP || 20000));

/** Global API limit: per session MAX_REQUESTS / per IP API_MAX_PER_IP (both per RATE_LIMIT_WINDOW_MS). */
export const apiRateLimiters: RateLimitRequestHandler[] = twoLayerLimiter({
  name: 'api',
  windowMs: WINDOW_MS,
  perSession: MAX_REQUESTS,
  perIp: API_MAX_PER_IP,
  message: 'Too many requests, please try again later',
  store: apiRedisStore,
  ipStore: makeStore('api-ip'),
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
  // Was 3/hour/IP — on a shared carrier IP that blocked sign-ups for everyone
  // after the third neighbour registered. Every registration still needs an
  // OTP delivered to a DISTINCT phone (per-phone caps in otpStore), so the IP
  // cap only guards against bulk automation.
  max: REGISTER_MAX_REQUESTS,
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
  // Key by the authenticated rider's user id (the route sits behind
  // `authenticate`) so riders sharing a carrier NAT IP don't eat each other's
  // quota; fall back to IP when no identity is available.
  keyGenerator: userOrIpKey,
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

// Keyed by the authenticated CUSTOMER (the route sits behind `authenticate`),
// not by IP: 5 orders/min is generous for one household but was a hard cap
// for an entire carrier NAT block when keyed by address.
export const orderRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 100 : 5,
  skip: skipInDev,
  store: orderRedisStore,
  keyGenerator: userOrIpKey,
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

// Public order tracking is unauthenticated (order number + phone). The lookup
// itself is safe (crypto-random order numbers, phone must match), but it
// returns a delivery address + live rider location, so make enumeration
// attempts expensive: 30 lookups / 15 min per IP. No legitimate client polls
// this endpoint (the website/app track pages use the authenticated route).
export const publicTrackingRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 30,
  skip: skipInDev,
  store: trackingRedisStore,
  message: {
    success: false,
    message: 'Too many tracking requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
});

// /send-otp + /pin-status are the account-enumeration surface: the generic
// auth limiter skips SUCCESSFUL requests, so an attacker probing phone numbers
// (every probe "succeeds") was never throttled. This dedicated limiter counts
// every request — 30 per 15 min per IP.
export const otpRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Per-IP anti-enumeration brake only; the per-PHONE cooldown + hourly send
  // caps (otpStore) are what actually bound SMS cost. 30/15min was too low
  // for a CGNAT address shared by a whole carrier block.
  max: OTP_MAX_REQUESTS,
  skip: skipInDev,
  store: otpRedisStore,
  message: {
    success: false,
    message: 'Too many verification requests, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many verification requests, please try again after 15 minutes',
      retryAfter: 15 * 60,
    });
  },
});

/**
 * Key for the per-SESSION refresh limit: a hash of the refresh token the
 * caller presented (body or cookie). Falls back to the IP when there is none.
 */
export function refreshSessionKey(req: Request): string {
  const token = getRefreshTokenFromRequest(req as Parameters<typeof getRefreshTokenFromRequest>[0]);
  if (typeof token === 'string' && token.length >= 20) {
    return `rt:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }
  return ipKeyGenerator(req.ip ?? '');
}

// Refresh tokens are long-lived credentials; hammering /refresh must never be
// unlimited. Two layers:
//  • per SESSION (the token presented): 20 per 15 min. An honest client
//    refreshes about once per 15 minutes.
//  • per IP: a high ceiling only. The old limit of 60 per 15 min PER IP
//    signed real customers out — Pakistani mobile carriers put thousands of
//    phones behind one address, so the 61st customer on that address got a 429
//    and both apps clear the session on a failed refresh.
const refreshPerSessionLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 20,
  skip: skipInDev,
  store: makeStore('refresh-session'),
  keyGenerator: refreshSessionKey,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many token refresh attempts, please try again later',
      retryAfter: 15 * 60,
    });
  },
});

const refreshPerIpLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : Math.max(60, Number(process.env.REFRESH_MAX_PER_IP || 3000)),
  skip: skipInDev,
  store: refreshRedisStore,
  message: {
    success: false,
    message: 'Too many token refresh attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Redis down → let the request through (alert already fired) instead of
  // returning 500 on every rate-limited endpoint.
  passOnStoreError: true,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many token refresh attempts, please try again later',
      retryAfter: 15 * 60,
    });
  },
});

/** Both layers, in order: the wide per-IP ceiling, then the per-session limit. */
export const refreshRateLimiter: RateLimitRequestHandler[] = [refreshPerIpLimiter, refreshPerSessionLimiter];

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
