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

/**
 * Password-login lockouts (customer/admin/rider) reuse this store: same
 * failure threshold, same escalating windows, same Redis persistence. The
 * scope prefix keeps password failures from mixing with PIN failures (or with
 * each other) for the same phone number.
 */
export const passwordLockKey = (scope: 'user' | 'admin' | 'rider' | 'shareholder', phone: string): string =>
  `pw:${scope}:${phone}`;

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

// ── One step at a time per account (B39) ────────────────────────────────────
// Read-then-write on the store let simultaneous requests overwrite each other
// and all pass the lock check. Every change for one key now runs in order
// inside this server (memory store and Redis alike). Several servers sharing
// one Redis would need an atomic script — today there is one server and no
// REDIS_URL (render.yaml).
const queues = new Map<string, Promise<unknown>>();
function oneAtATime<T>(key: string, step: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve();
  const run = before.then(step, step);
  const settled = run.then(() => undefined, () => undefined);
  queues.set(key, settled);
  settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return run;
}

/** One more failure for this key (and the lock once the threshold is hit). */
async function countFailure(phone: string): Promise<{ lockedUntil: number; fails: number }> {
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

export async function registerPinFailure(
  phone: string
): Promise<{ lockedUntil: number; fails: number }> {
  return oneAtATime(phone, () => countFailure(phone));
}

/**
 * B39: reserve this attempt BEFORE the (slow) PIN / password check — refused
 * while locked, otherwise counted right away. At most PIN_FAIL_THRESHOLD
 * guesses per round, however many arrive at the same moment. The try that
 * reaches the threshold is still checked; a right answer clears everything
 * (clearPinFailures), a wrong one leaves the lock in place.
 */
export async function reservePinAttempt(
  phone: string
): Promise<{ allowed: boolean; lockedUntil: number; fails: number }> {
  return oneAtATime(phone, async () => {
    const state = await getPinLockoutState(phone);
    if (state.lockedUntil && state.lockedUntil > Date.now()) {
      return { allowed: false, lockedUntil: state.lockedUntil, fails: state.fails };
    }
    const { lockedUntil, fails } = await countFailure(phone);
    return { allowed: true, lockedUntil, fails };
  });
}

/**
 * Give one reserved attempt back — for a step that was not a wrong answer
 * (the admin's correct password that is now asked for the one-time code).
 * Before B39 such a step was never counted. A lock that this very attempt
 * caused is undone too; any other lock stays.
 */
export async function releasePinAttempt(
  phone: string,
  reservation: { allowed: boolean; lockedUntil: number }
): Promise<void> {
  if (!reservation.allowed) return;
  await oneAtATime(phone, async () => {
    const now = Date.now();
    const state = await getPinLockoutState(phone);
    if (reservation.lockedUntil > 0 && state.lockedUntil === reservation.lockedUntil) {
      await writeRaw(phone, {
        fails: PIN_FAIL_THRESHOLD - 1,
        firstFailAt: state.firstFailAt || now,
        lockedUntil: 0,
        totalRounds: Math.max(0, state.totalRounds - 1),
      }, now);
      return;
    }
    if (state.lockedUntil && state.lockedUntil > now) return;
    if (state.fails > 0) await writeRaw(phone, { ...state, fails: state.fails - 1 }, now);
  });
}

/**
 * After a reserved attempt turned out wrong: nothing more to count (the
 * reservation did) — just whether the account is now locked.
 */
export async function pinAttemptFailed(phone: string): Promise<{ lockedUntil: number; fails: number }> {
  return oneAtATime(phone, async () => {
    const state = await getPinLockoutState(phone);
    return { lockedUntil: state.lockedUntil > Date.now() ? state.lockedUntil : 0, fails: state.fails };
  });
}

export async function clearPinFailures(phone: string): Promise<void> {
  await oneAtATime(phone, () => remove(phone));
}
