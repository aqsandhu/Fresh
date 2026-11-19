// Screen sweep (round C): every website page — as a guest and as the signed-in
// customer from journey 1 — no console error, no failed server call (5xx), no
// "NaN", "undefined", "Invalid Date" or "[object Object]" on screen.
// Run on demand: SWEEP=1 npx playwright test sweep-website
import { expect, test, type Page } from '@playwright/test';
import { WEBSITE, apiGet } from './env';
import { readJourney } from './journey';

test.skip(!process.env.SWEEP, 'screen sweep runs on demand (SWEEP=1)');

const PAGES = ['/', '/products', '/search?q=tomato', '/cart', '/checkout', '/about', '/contact', '/faq', '/help', '/privacy',
  '/returns', '/shipping', '/terms', '/franchise', '/work-as-rider', '/atta-chakki', '/atta-chakki/requests', '/orders',
  '/profile', '/addresses', '/wishlist', '/settings', '/settings/pin', '/support', '/delete-account', '/login', '/register',
  '/restaurant', '/restaurant/login', '/restaurant/register', '/ocp/login', '/shareholder/login', '/select-city'];
const BAD_TEXT = /\bNaN\b|\bundefined\b|Invalid Date|\[object Object\]/;

async function sweep(page: Page, label: string): Promise<string[]> {
  const problems: string[] = [];
  let current = '';
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${label} ${current}: console: ${m.text().slice(0, 120)} @ ${m.location().url}`); });
  page.on('pageerror', (e) => problems.push(`${label} ${current}: page error: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`${label} ${current}: ${r.status()} ${r.url().slice(0, 120)}`); });
  for (const path of PAGES) {
    current = path;
    await page.goto(`${WEBSITE}${path}`);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    const text = await page.locator('body').innerText().catch(() => '');
    const m = text.match(BAD_TEXT);
    if (m) {
      const at = text.indexOf(m[0]);
      problems.push(`${label} ${path}: shows "${m[0]}" — …${text.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ')}…`);
    }
  }
  return problems;
}

test('every website page opens cleanly — guest and signed in', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const city = ((await apiGet('/site-settings/cities')).data as any[]).find((c) => c.name === 'Gujrat');
  const setCity = ([id, name]: string[]) => {
    localStorage.setItem('website_selected_city_id', id);
    localStorage.setItem('website_selected_city_name', name);
  };

  const guest = await (await browser.newContext()).newPage();
  await guest.addInitScript(setCity, [city.id, city.name]);
  const problems = await sweep(guest, 'guest');

  const { customerPhone } = readJourney();
  if (customerPhone) {
    const me = await (await browser.newContext()).newPage();
    await me.addInitScript(setCity, [city.id, city.name]);
    await me.addLocatorHandler(me.getByRole('dialog', { name: /earned coupons/i }), async () => { await me.keyboard.press('Escape'); });
    await me.goto(`${WEBSITE}/login`);
    await me.getByPlaceholder('03XX-XXXXXXX').fill(customerPhone);
    await me.locator('button[type="submit"]').first().click();
    await me.getByLabel('PIN digit 1 of 4').click();
    await me.keyboard.type('4826', { delay: 60 });
    await expect(me).not.toHaveURL(/\/login/);
    problems.push(...(await sweep(me, 'customer')));
  }
  // eslint-disable-next-line no-console
  console.log(`website sweep: ${PAGES.length} pages × ${customerPhone ? 2 : 1}, ${problems.length} problem(s)\n${problems.join('\n')}`);
  expect(problems).toEqual([]);
});
