import { esc } from '@/lib/escape';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    expect(esc(`<b>' & " </b>`)).toBe('&lt;b&gt;&#39; &amp; &quot; &lt;/b&gt;');
  });

  it('passes through safe text unchanged', () => {
    expect(esc('Ali Khan')).toBe('Ali Khan');
  });

  it('handles null/undefined and non-string values', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(42)).toBe('42');
  });
});
