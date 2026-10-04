import {
  formatCurrency,
  formatDistance,
  formatPhoneNumber,
  isValidPhoneNumber,
  toWhatsAppNumber,
  truncateText,
  getInitials,
  getRatingColor,
  parseErrorMessage,
  deepClone,
  isEmptyObject,
  retry,
  haversineMeters,
  formatSqlTime,
  formatSlotRange,
  toNumber,
  toNumberOrNull,
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

describe('number parsing', () => {
  it('toNumber falls back, toNumberOrNull preserves absence', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('abc', 7)).toBe(7);
    expect(toNumber(null)).toBe(0);
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull(undefined)).toBeNull();
    expect(toNumberOrNull('0')).toBe(0);
  });
});

describe('formatDistance / haversineMeters', () => {
  it('shows meters below 1 km and kilometers above', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(12340)).toBe('12.3 km');
  });

  it('computes great-circle distance (Gujrat → Lahore ≈ 120 km)', () => {
    const d = haversineMeters({ latitude: 32.5742, longitude: 74.0789 }, { latitude: 31.5204, longitude: 74.3587 });
    expect(d).toBeGreaterThan(115_000);
    expect(d).toBeLessThan(125_000);
    expect(haversineMeters({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 })).toBe(0);
  });
});

describe('time slots', () => {
  it('formats SQL TIME values and ranges', () => {
    expect(formatSqlTime('10:00:00')).toBe('10:00 AM');
    expect(formatSqlTime('14:30:00')).toBe('2:30 PM');
    expect(formatSqlTime('00:05:00')).toBe('12:05 AM');
    expect(formatSqlTime(null)).toBe('');
    expect(formatSlotRange('10:00:00', '14:00:00')).toBe('10:00 AM – 2:00 PM');
    expect(formatSlotRange(null, '14:00:00')).toBe('2:00 PM');
  });
});

describe('phone helpers', () => {
  it('formats local 03xx numbers to +92', () => {
    expect(formatPhoneNumber('03001234567')).toBe('+92 300 1234567');
    expect(formatPhoneNumber('923001234567')).toBe('+92 300 1234567');
    expect(formatPhoneNumber('+92 300 1234567')).toBe('+92 300 1234567');
  });

  it('accepts valid Pakistani mobile numbers and rejects others', () => {
    expect(isValidPhoneNumber('03001234567')).toBe(true);
    expect(isValidPhoneNumber('923001234567')).toBe(true);
    expect(isValidPhoneNumber('+92-300-1234567')).toBe(true);
    expect(isValidPhoneNumber('0300123')).toBe(false);
    expect(isValidPhoneNumber('16505551234')).toBe(false);
    expect(isValidPhoneNumber('abc')).toBe(false);
  });

  it('produces wa.me-compatible numbers', () => {
    expect(toWhatsAppNumber('0300-1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('+92 300 1234567')).toBe('923001234567');
    expect(toWhatsAppNumber('3001234567')).toBe('923001234567');
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
    expect(parseErrorMessage({ response: { data: { message: 'Order already taken' } } })).toBe('Order already taken');
  });

  it('falls back to Error.message, plain strings, then a generic message', () => {
    expect(parseErrorMessage(new Error('timeout'))).toBe('timeout');
    expect(parseErrorMessage('plain failure')).toBe('plain failure');
    expect(parseErrorMessage(undefined)).toBe('An unknown error occurred');
  });
});

describe('retry', () => {
  it('resolves once a later attempt succeeds', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce('ok');
    await expect(retry(fn, 3, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always down'));
    await expect(retry(fn, 2, 1)).rejects.toThrow('always down');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
