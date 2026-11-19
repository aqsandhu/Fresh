// ============================================================================
// PIN LOCKOUT — unit tests (in-memory fallback path, no Redis configured)
// Covers the brute-force protection: failures accumulate, a lockout window
// opens after the threshold, escalates on repeat rounds, and a success clears.
// ============================================================================

import { jest } from '@jest/globals';
import {
  getPinLockoutState,
  registerPinFailure,
  clearPinFailures,
  PIN_FAIL_THRESHOLD,
} from '@/config/pinLockout';

// A unique phone per test keeps the in-memory map isolated between cases.
let counter = 0;
const uniquePhone = () => `+9230000000${(counter++).toString().padStart(2, '0')}`;

describe('PIN lockout (in-memory fallback)', () => {
  it('starts with a clean slate', async () => {
    const state = await getPinLockoutState(uniquePhone());
    expect(state).toEqual({ fails: 0, firstFailAt: 0, lockedUntil: 0, totalRounds: 0 });
  });

  it('counts failures without locking below the threshold', async () => {
    const phone = uniquePhone();
    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) {
      const { lockedUntil, fails } = await registerPinFailure(phone);
      expect(lockedUntil).toBe(0);
      expect(fails).toBe(i);
    }
    const state = await getPinLockoutState(phone);
    expect(state.lockedUntil).toBe(0);
  });

  it('opens a lockout window once the threshold is hit', async () => {
    const phone = uniquePhone();
    let last = { lockedUntil: 0, fails: 0 };
    for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) {
      last = await registerPinFailure(phone);
    }
    expect(last.lockedUntil).toBeGreaterThan(Date.now());

    const state = await getPinLockoutState(phone);
    expect(state.lockedUntil).toBeGreaterThan(Date.now());
    expect(state.totalRounds).toBe(1);
  });

  it('escalates the lockout window on the next round of failures', async () => {
    jest.useFakeTimers();
    try {
      const phone = uniquePhone();
      const start = Date.now();

      for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) await registerPinFailure(phone);
      const firstLock = (await getPinLockoutState(phone)).lockedUntil - start;

      // Jump past the first lockout, then fail another full round.
      jest.setSystemTime(start + firstLock + 1000);
      const second = start + firstLock + 1000;
      let lockedUntil = 0;
      for (let i = 0; i < PIN_FAIL_THRESHOLD; i++) {
        ({ lockedUntil } = await registerPinFailure(phone));
      }
      const secondWindow = lockedUntil - second;

      expect((await getPinLockoutState(phone)).totalRounds).toBe(2);
      expect(secondWindow).toBeGreaterThan(firstLock);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the counter after a successful verification', async () => {
    const phone = uniquePhone();
    await registerPinFailure(phone);
    await registerPinFailure(phone);
    await clearPinFailures(phone);
    expect(await getPinLockoutState(phone)).toEqual({
      fails: 0,
      firstFailAt: 0,
      lockedUntil: 0,
      totalRounds: 0,
    });
  });
});

// ============================================================================
// B39 (W24 confirmation round): guesses sent AT THE SAME MOMENT got past the
// lock — the lock was checked before the slow PIN comparison and the failure
// count was read-then-written, so 8 parallel wrong PINs were all checked
// (only 1 of 8 was refused). An attempt is now reserved (counted) atomically
// BEFORE the comparison: at most PIN_FAIL_THRESHOLD guesses per round.
// ============================================================================
import { reservePinAttempt, pinAttemptFailed, releasePinAttempt } from '@/config/pinLockout';

describe('PIN attempts reserved before the check (B39)', () => {
  it('8 attempts at once: exactly PIN_FAIL_THRESHOLD go through, the rest are refused', async () => {
    const phone = uniquePhone();
    const results = await Promise.all(Array.from({ length: 8 }, () => reservePinAttempt(phone)));
    expect(results.filter((r) => r.allowed)).toHaveLength(PIN_FAIL_THRESHOLD);
    expect(results.filter((r) => !r.allowed).every((r) => r.lockedUntil > Date.now())).toBe(true);
  });

  it('one after another: the 5th wrong try locks (as before); a right try clears everything', async () => {
    const phone = uniquePhone();
    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) {
      expect((await reservePinAttempt(phone)).allowed).toBe(true);
      expect((await pinAttemptFailed(phone)).lockedUntil).toBe(0);
    }
    expect((await reservePinAttempt(phone)).allowed).toBe(true); // the 5th try is still checked
    expect((await pinAttemptFailed(phone)).lockedUntil).toBeGreaterThan(Date.now()); // …and wrong → locked
    expect((await reservePinAttempt(phone)).allowed).toBe(false);

    const other = uniquePhone();
    await reservePinAttempt(other);
    await reservePinAttempt(other);
    await clearPinFailures(other); // a right PIN
    expect(await getPinLockoutState(other)).toEqual({ fails: 0, firstFailAt: 0, lockedUntil: 0, totalRounds: 0 });
  });

  it('a step that was not a wrong answer gives its attempt back (even the 5th)', async () => {
    const phone = uniquePhone();
    for (let i = 1; i < PIN_FAIL_THRESHOLD; i++) { await reservePinAttempt(phone); await pinAttemptFailed(phone); }
    const fifth = await reservePinAttempt(phone); // locks…
    expect(fifth.lockedUntil).toBeGreaterThan(Date.now());
    await releasePinAttempt(phone, fifth); // …but it was the right password (code still to come)
    expect((await getPinLockoutState(phone)).lockedUntil).toBe(0);
    expect((await getPinLockoutState(phone)).fails).toBe(PIN_FAIL_THRESHOLD - 1);
    const next = await reservePinAttempt(phone);
    expect(next.allowed).toBe(true);
    expect(next.lockedUntil).toBeGreaterThan(Date.now()); // one more wrong try locks again
  });
});
