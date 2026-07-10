import {
  formatCurrency,
  formatDistance,
  formatPhoneNumber,
  isValidPhoneNumber,
  calculateETA,
  truncateText,
  getInitials,
  getRatingColor,
  parseErrorMessage,
  deepClone,
  isEmptyObject,
  retry,
} from '../src/utils/helpers';

describe('formatCurrency', () => {
  it('formats whole rupee amounts with thousands separators', () => {
    expect(formatCurrency(1500)).toBe('Rs. 1,500');
    expect(formatCurrency(1234567)).toBe('Rs. 1,234,567');
  });

  it('keeps paisa when present and handles negatives', () => {
    expect(formatCurrency(99.5)).toBe('Rs. 99.50');
    expect(formatCurrency(-250)).toBe('Rs. -250');
  });

  it('never renders a blank figure for bad input', () => {
    expect(formatCurrency(null)).toBe('Rs. 0');
    expect(formatCurrency(undefined)).toBe('Rs. 0');
    expect(formatCurrency('not-a-number')).toBe('Rs. 0');
    expect(formatCurrency('750')).toBe('Rs. 750');
  });
});

describe('formatDistance', () => {
  it('shows meters below 1 km and kilometers above', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(12340)).toBe('12.3 km');
  });
});

describe('formatPhoneNumber / isValidPhoneNumber', () => {
  it('formats local 03xx numbers to +92', () => {
    expect(formatPhoneNumber('03001234567')).toBe('+92 300 1234567');
  });

  it('formats numbers already carrying the country code', () => {
    expect(formatPhoneNumber('923001234567')).toBe('+92 300 1234567');
    expect(formatPhoneNumber('+92 300 1234567')).toBe('+92 300 1234567');
  });

  it('accepts valid Pakistani mobile numbers', () => {
    expect(isValidPhoneNumber('03001234567')).toBe(true);
    expect(isValidPhoneNumber('923001234567')).toBe(true);
    expect(isValidPhoneNumber('+92-300-1234567')).toBe(true);
  });

  it('rejects short, foreign, and garbage numbers', () => {
    expect(isValidPhoneNumber('0300123')).toBe(false);
    expect(isValidPhoneNumber('16505551234')).toBe(false);
    expect(isValidPhoneNumber('abc')).toBe(false);
  });
});

describe('calculateETA', () => {
  it('reports sub-minute, minutes, and hour ranges', () => {
    expect(calculateETA(0)).toBe('< 1 min');
    expect(calculateETA(100)).toBe('1 min'); // ceil rounds any distance up to a whole minute
    expect(calculateETA(5000)).toBe('12 min'); // 5 km at 25 km/h
    expect(calculateETA(50000)).toBe('2h 0m'); // 50 km at 25 km/h
  });
});

describe('small utilities', () => {
  it('truncateText appends ellipsis only when needed', () => {
    expect(truncateText('short', 10)).toBe('short');
    expect(truncateText('a very long address line', 10)).toBe('a very lon...');
  });

  it('getInitials takes at most two initials', () => {
    expect(getInitials('Ali Khan')).toBe('AK');
    expect(getInitials('Sara')).toBe('S');
    expect(getInitials('Muhammad Usman Ali')).toBe('MU');
  });

  it('getRatingColor bands ratings into green/amber/red', () => {
    expect(getRatingColor(4.8)).toBe('#10B981');
    expect(getRatingColor(4.0)).toBe('#F59E0B');
    expect(getRatingColor(2.9)).toBe('#EF4444');
  });

  it('deepClone produces an independent copy', () => {
    const original = { rider: { id: 'r1', stats: [1, 2] } };
    const copy = deepClone(original);
    copy.rider.stats.push(3);
    expect(original.rider.stats).toEqual([1, 2]);
  });

  it('isEmptyObject distinguishes empty from populated objects', () => {
    expect(isEmptyObject({})).toBe(true);
    expect(isEmptyObject({ a: 1 })).toBe(false);
  });
});

describe('parseErrorMessage', () => {
  it('prefers the backend response message', () => {
    expect(parseErrorMessage({ response: { data: { message: 'Order already taken' } } })).toBe(
      'Order already taken'
    );
  });

  it('falls back to Error.message, plain strings, then a generic message', () => {
    expect(parseErrorMessage(new Error('timeout'))).toBe('timeout');
    expect(parseErrorMessage('plain failure')).toBe('plain failure');
    expect(parseErrorMessage(undefined)).toBe('An unknown error occurred');
  });
});

describe('retry', () => {
  it('resolves once a later attempt succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('ok');

    await expect(retry(fn, 3, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always down'));

    await expect(retry(fn, 2, 1)).rejects.toThrow('always down');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
