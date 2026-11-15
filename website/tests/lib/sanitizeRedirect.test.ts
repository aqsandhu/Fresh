import { sanitizeRedirect } from '@/lib/utils';

describe('sanitizeRedirect', () => {
  it('allows same-site absolute paths', () => {
    expect(sanitizeRedirect('/checkout')).toBe('/checkout');
    expect(sanitizeRedirect('/orders?tab=active')).toBe('/orders?tab=active');
    expect(sanitizeRedirect('/')).toBe('/');
  });

  it('falls back to / for external or scheme-relative URLs', () => {
    expect(sanitizeRedirect('https://evil.com')).toBe('/');
    expect(sanitizeRedirect('//evil.com')).toBe('/');
    expect(sanitizeRedirect('javascript:alert(1)')).toBe('/');
  });

  it('falls back to / for paths a browser turns into another site', () => {
    expect(sanitizeRedirect('/\\evil.com')).toBe('/');
    expect(sanitizeRedirect('/\\/evil.com')).toBe('/');
    expect(sanitizeRedirect('/\t/evil.com')).toBe('/');
    expect(sanitizeRedirect('/\n/evil.com')).toBe('/');
    expect(sanitizeRedirect('/ /evil.com')).toBe('/');
  });

  it('keeps an encoded path as it was', () => {
    expect(sanitizeRedirect('/search?q=atta%20chakki#top')).toBe('/search?q=atta%20chakki#top');
  });

  it('falls back to / for empty or missing values', () => {
    expect(sanitizeRedirect(null)).toBe('/');
    expect(sanitizeRedirect(undefined)).toBe('/');
    expect(sanitizeRedirect('')).toBe('/');
  });
});
