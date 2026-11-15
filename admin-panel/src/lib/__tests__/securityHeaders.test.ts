// The admin token lives in localStorage (owner decision Q2), so the panel's
// Content-Security-Policy is its main guard against injected scripts. This
// keeps the deploy headers and index.html from drifting back.
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const all = Object.fromEntries(vercel.headers.flatMap((h) => h.headers).map((h) => [h.key, h.value]));

it('every page gets a script-limiting CSP and anti-framing headers', () => {
  const csp = all['Content-Security-Policy'];
  expect(csp).toMatch(/script-src 'self'/);
  expect(csp).not.toMatch(/'unsafe-inline'/);
  expect(csp).toMatch(/object-src 'none'/);
  expect(csp).toMatch(/frame-ancestors 'none'/);
  expect(all['X-Frame-Options']).toBe('DENY');
  expect(all['X-Content-Type-Options']).toBe('nosniff');
});

it('index.html loads no inline or third-party script (the CSP would block it)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  for (const tag of scripts) {
    expect(tag).toMatch(/src="\//);
  }
  expect(html).not.toMatch(/<script\b[^>]*>[^<\s]/);
});
