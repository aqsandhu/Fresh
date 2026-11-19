// ============================================================================
// PIN STRENGTH (B33, round 8)
// A new 4-digit PIN used to be accepted even as 0000, 1111 or 1234 — the PINs
// people try first. Lockout after wrong tries limits the damage, but
// international practice (NIST SP 800-63B: refuse commonly used secrets)
// is to not allow them at all. Applies ONLY when a PIN is set or changed;
// existing PINs keep working.
// ============================================================================

// The most used 4-digit PINs in public PIN studies, plus keypad patterns.
const COMMON_PINS = new Set([
  '1234', '1111', '0000', '1212', '7777', '1004', '2000', '4444', '2222', '6969',
  '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321', '2001', '1010',
  '2580', '0852',
]);

export const WEAK_PIN_MESSAGE =
  'This PIN is too easy to guess (like 1234, 0000 or 1111). Please choose a different 4-digit PIN.';

/** True for a PIN that anyone would try first. Format (4 digits) is checked elsewhere. */
export function isWeakPin(pin: unknown): boolean {
  const s = String(pin ?? '');
  if (!/^\d{4}$/.test(s)) return false;
  if (COMMON_PINS.has(s)) return true;
  const d = s.split('').map(Number);
  const allSame = d.every((x) => x === d[0]);
  const rising = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const falling = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return allSame || rising || falling;
}
