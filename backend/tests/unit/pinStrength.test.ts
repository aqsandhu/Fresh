// B33 (round 8): a new PIN may not be one that anyone would try first.
import { isWeakPin } from '@/utils/pinStrength';

describe('isWeakPin', () => {
  it.each(['0000', '1111', '9999', '1234', '2345', '6789', '4321', '9876', '1212', '2580', '6969', '2000'])('%s is refused', (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });
  it.each(['4826', '7391', '5566', '1357', '2468', '3071', '9035'])('%s is fine', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });
  it('leaves the format check to the validators', () => {
    expect(isWeakPin('12')).toBe(false);
    expect(isWeakPin(undefined)).toBe(false);
  });
});
