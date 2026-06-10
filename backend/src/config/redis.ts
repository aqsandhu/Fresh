import logger from '../utils/logger';

type RedisLike = {
  call: (...args: string[]) => Promise<unknown>;
};

let redisClient: RedisLike | null = null;
let connectAttempted = false;

/** Lazy Redis client for distributed rate limiting (optional). */
export function getRedisClient(): RedisLike | null {
  if (redisClient) return redisClient;
  if (connectAttempted) return null;
  connectAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('REDIS_URL not set — rate limiter uses in-memory store');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis');
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.connect().catch((err: Error) => {
      logger.warn('Redis connection failed — rate limiter uses in-memory store', {
        message: err.message,
      });
    });
    redisClient = client;
    logger.info('Redis client initialized for rate limiting');
    return redisClient;
  } catch (err) {
    logger.warn('Redis module unavailable — rate limiter uses in-memory store', { err });
    return null;
  }
}
