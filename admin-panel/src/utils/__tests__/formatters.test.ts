import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatPhoneNumber,
  truncateText,
  getOrderStatusColor,
  getRiderStatusColor,
  formatOrderStatus,
  resolveImageUrl,
} from '../formatters';

describe('formatCurrency', () => {
  it('formats whole rupees with thousands separators and no decimals', () => {
    expect(formatCurrency(1234)).toBe('Rs. 1,234');
    expect(formatCurrency(1000000)).toBe('Rs. 1,000,000');
  });
  it('keeps non-zero paisa', () => {
    expect(formatCurrency(1234.5)).toBe('Rs. 1,234.50');
  });
  it('handles negatives, strings, and invalid input', () => {
    expect(formatCurrency(-50)).toBe('Rs. -50');
    expect(formatCurrency('250')).toBe('Rs. 250');
    expect(formatCurrency(null)).toBe('Rs. 0');
    expect(formatCurrency('not-a-number')).toBe('Rs. 0');
  });
});

describe('formatPhoneNumber', () => {
  it('formats 92-prefixed and 0-prefixed numbers', () => {
    expect(formatPhoneNumber('923001234567')).toBe('+92 300 123 4567');
    expect(formatPhoneNumber('03001234567')).toBe('+92 300 123 4567');
  });
  it('returns dash for empty and passes through unknown shapes', () => {
    expect(formatPhoneNumber(null)).toBe('-');
    expect(formatPhoneNumber('12345')).toBe('12345');
  });
});

describe('truncateText', () => {
  it('leaves short text untouched and truncates long text', () => {
    expect(truncateText('hello', 10)).toBe('hello');
    expect(truncateText('hello world', 5)).toBe('hello...');
  });
});

describe('status colour helpers', () => {
  it('maps known order statuses and falls back to gray', () => {
    expect(getOrderStatusColor('delivered')).toEqual({ bg: 'bg-green-100', text: 'text-green-800' });
    expect(getOrderStatusColor('unknown-status')).toEqual({ bg: 'bg-gray-100', text: 'text-gray-800' });
  });
  it('maps known rider statuses and falls back to gray', () => {
    expect(getRiderStatusColor('available')).toEqual({ bg: 'bg-green-100', text: 'text-green-800' });
    expect(getRiderStatusColor('nope')).toEqual({ bg: 'bg-gray-100', text: 'text-gray-800' });
  });
});

describe('formatOrderStatus', () => {
  it('title-cases snake_case status', () => {
    expect(formatOrderStatus('out_for_delivery')).toBe('Out For Delivery');
    expect(formatOrderStatus(null)).toBe('Unknown');
  });
});

describe('date formatters', () => {
  it('returns dash for empty dates', () => {
    expect(formatDate('' as unknown as string)).toBe('-');
    expect(formatDateTime('' as unknown as string)).toBe('-');
    expect(formatRelativeTime('' as unknown as string)).toBe('-');
  });
  it('formats a local Date deterministically', () => {
    // Constructed and formatted in the same local tz — no timezone flakiness.
    expect(formatDate(new Date(2024, 0, 15))).toBe('Jan 15, 2024');
  });
  it('describes recent times relatively', () => {
    expect(formatRelativeTime(new Date())).toBe('Just now');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60 * 1000))).toBe('5 min ago');
    expect(formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000))).toBe('2 hours ago');
  });
});

describe('resolveImageUrl', () => {
  it('passes through data URLs and empty values', () => {
    expect(resolveImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(resolveImageUrl(null)).toBe('');
  });
  it('passes through public absolute URLs unchanged', () => {
    expect(resolveImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });
});
