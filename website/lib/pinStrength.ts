// Same rule as the server (backend/src/utils/pinStrength.ts, B33): a new PIN
// may not be one anyone would try first. Checked here BEFORE an account is
// created at checkout, so a refused PIN never leaves an account without one.
const COMMON_PINS = new Set([
  '1234', '1111', '0000', '1212', '7777', '1004', '2000', '4444', '2222', '6969',
  '9999', '3333', '5555', '6666', '1122', '1313', '8888', '4321', '2001', '1010',
  '2580', '0852',
])

export const WEAK_PIN_MESSAGE = 'This PIN is too easy to guess (like 1234, 0000 or 1111). Please choose a different 4-digit PIN.'

export function isWeakPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false
  if (COMMON_PINS.has(pin)) return true
  const d = pin.split('').map(Number)
  const allSame = d.every((x) => x === d[0])
  const rising = d.every((x, i) => i === 0 || x === d[i - 1] + 1)
  const falling = d.every((x, i) => i === 0 || x === d[i - 1] - 1)
  return allSame || rising || falling
}
