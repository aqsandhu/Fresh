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
