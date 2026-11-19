// Screen sweep (round C): every admin page the super admin can open — no
// console error, no failed server call (5xx), and no "NaN", "undefined",
// "Invalid Date" or "[object Object]" on screen. Run on demand (not one of the
// order journeys): SWEEP=1 npx playwright test sweep-admin
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, ADMIN_PASSWORD, ADMIN_PHONE, OTP } from './env';

test.skip(!process.env.SWEEP, 'screen sweep runs on demand (SWEEP=1)');

const BAD_TEXT = /\bNaN\b|\bundefined\b|Invalid Date|\[object Object\]/;

async function signIn(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByPlaceholder('+923001234567').fill(ADMIN_PHONE);
  await page.getByPlaceholder('Enter your password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByPlaceholder('6-digit code').fill(OTP);
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('every admin page opens cleanly for the super admin', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  const problems: string[] = [];
  let current = '';
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${current}: console: ${m.text().slice(0, 120)} @ ${m.location().url}`); });
  page.on('pageerror', (e) => problems.push(`${current}: page error: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() === 404) problems.push(`${current || 'sign-in'}: 404 ${r.url().slice(0, 140)}`); if (r.status() >= 500) problems.push(`${current}: ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)}`); });

  await signIn(page);
  const links = await page.locator('nav a[href^="/"]').evaluateAll((as) => Array.from(new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''))).filter(Boolean));
  expect(links.length).toBeGreaterThan(15);
  for (const href of links) {
    current = href;
    await page.goto(`${ADMIN}${href}`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    const text = await page.locator('main').innerText().catch(() => '');
    const m = text.match(BAD_TEXT);
    if (m) {
      const at = text.indexOf(m[0]);
      problems.push(`${href}: shows "${m[0]}" — …${text.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ')}…`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`admin sweep: ${links.length} pages, ${problems.length} problem(s)\n${problems.join('\n')}`);
  expect(problems).toEqual([]);
});
