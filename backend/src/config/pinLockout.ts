// ============================================================================
// PER-ACCOUNT PIN BRUTE-FORCE LOCKOUT
// ============================================================================
// A 4-digit PIN is only 10,000 combinations, so a botnet can defeat an
// IP-based limiter trivially. We track failed attempts per phone and lock the
// account for an exponentially increasing window after each round of failures,
// regardless of source IP.
//
// State lives in Redis when REDIS_URL is set, so the lockout survives process
// restarts and is shared across instances (Render free tier sleeps/restarts
// frequently — an in-memory-only counter resets on every wake, letting an
// attacker keep guessing). When Redis is unavailable we fall back to an
// in-memory Map so single-instance deployments still get protection.

import { getRedisClient } from './redis';
import logger from '../utils/logger';

export const PIN_FAIL_THRESHOLD = 5;
export const PIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const PIN_LOCKOUT_BASE_MS = 15 * 60 * 1000;
const PIN_LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;

export interface PinLockoutEntry {
  fails: number;
  firstFailAt: number;
  lockedUntil: number;
  totalRounds: number;
}

const EMPTY: PinLockoutEntry = { fails: 0, firstFailAt: 0, lockedUntil: 0, totalRounds: 0 };

const memory = new Map<string, PinLockoutEntry>();

const redisKey = (phone: string) => `pinlock:${phone}`;

// Keep the record alive across the whole escalation-retention horizon so that
// repeated lock rounds keep escalating (a 15-min lockout that expired at the
// same time as the 15-min failure window used to wipe totalRounds, defeating
// the exponential backoff entirely). After this idle period with no activity
// the key expires and escalation history is forgotten.
function ttlMs(_entry: PinLockoutEntry, _now: number): number {
  return PIN_LOCKOUT_MAX_MS;
}

async function readRaw(phone: string): Promise<PinLockoutEntry | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = (await redis.call('GET', redisKey(phone))) as string | null;
      return raw ? (JSON.parse(raw) as PinLockoutEntry) : null;
    } catch (err) {
      logger.warn('PIN lockout Redis read failed — using in-memory fallback', { err });
    }
  }
  return memory.get(phone) ?? null;
}

async function writeRaw(phone: string, entry: PinLockoutEntry, now: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.call(
        'SET',
        redisKey(phone),
        JSON.stringify(entry),
        'PX',
        String(Math.ceil(ttlMs(entry, now)))
      );
      return;
    } catch (err) {
      logger.warn('PIN lockout Redis write failed — using in-memory fallback', { err });
    }
  }
  memory.set(phone, entry);
}

async function remove(phone: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.call('DEL', redisKey(phone));
      return;
    } catch (err) {
      logger.warn('PIN lockout Redis delete failed — using in-memory fallback', { err });
    }
  }
  memory.delete(phone);
}

export async function getPinLockoutState(phone: string): Promise<PinLockoutEntry> {
  const now = Date.now();
  const entry = await readRaw(phone);
  if (!entry) return { ...EMPTY };

  // Still inside an active lockout window.
  if (entry.lockedUntil && entry.lockedUntil > now) return entry;

  // Forget everything (including escalation history) after a long idle period.
  const lastActivity = Math.max(entry.firstFailAt, entry.lockedUntil);
  if (lastActivity && now - lastActivity > PIN_LOCKOUT_MAX_MS) {
    await remove(phone);
    return { ...EMPTY };
  }

  // The rolling failure window elapsed: reset the consecutive-failure counter
  // but RETAIN totalRounds so the next round of failures escalates the lockout.
  if (entry.firstFailAt && now - entry.firstFailAt > PIN_FAIL_WINDOW_MS) {
    return { fails: 0, firstFailAt: 0, lockedUntil: 0, totalRounds: entry.totalRounds };
  }

  return entry;
}

export async function registerPinFailure(
  phone: string
): Promise<{ lockedUntil: number; fails: number }> {
  const now = Date.now();
  const current = await getPinLockoutState(phone);
  const fails = current.fails + 1;
  let lockedUntil = 0;
  let totalRounds = current.totalRounds;
  if (fails >= PIN_FAIL_THRESHOLD) {
    totalRounds += 1;
    lockedUntil = now + Math.min(PIN_LOCKOUT_BASE_MS * 2 ** (totalRounds - 1), PIN_LOCKOUT_MAX_MS);
  }
  const next: PinLockoutEntry = {
    fails: lockedUntil ? 0 : fails,
    firstFailAt: current.firstFailAt || now,
    lockedUntil,
    totalRounds,
  };
  await writeRaw(phone, next, now);
  return { lockedUntil, fails };
}

export async function clearPinFailures(phone: string): Promise<void> {
  await remove(phone);
}
