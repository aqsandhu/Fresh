// Journey 3 (W22) — the wishlist is kept with the account: the customer from
// journey 1 saves a product in one browser, sees it in a second browser, and
// removing it there removes it in the first one too.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { WEBSITE, apiGet } from './env';
import { readJourney } from './journey';

async function signedInPage(browser: Browser, phone: string, city: { id: string; name: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // After journey 2 delivered the first order, the customer is offered reward
  // coupons — a real pop-up; close it the way a customer does whenever it shows.
  await page.addLocatorHandler(page.getByRole('dialog', { name: /earned coupons/i }), async () => {
    await page.keyboard.press('Escape');
  });
  await page.addInitScript(([id, name]) => {
    localStorage.setItem('website_selected_city_id', id);
    localStorage.setItem('website_selected_city_name', name);
  }, [city.id, city.name]);
  await page.goto(`${WEBSITE}/login`);
  await page.getByPlaceholder('03XX-XXXXXXX').fill(phone);
  await page.locator('button[type="submit"]').first().click();
  await page.getByLabel('PIN digit 1 of 4').click();
  await page.keyboard.type('4826', { delay: 60 });
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test('the same wishlist in two browsers signed in to one account', async ({ browser }) => {
  const { customerPhone } = readJourney();
  test.skip(!customerPhone, 'journey 1 did not create a customer');
  const city = ((await apiGet('/site-settings/cities')).data as any[]).find((c) => c.name === 'Gujrat');
  const product = ((await apiGet(`/products?search=E2E%20Tomato&city_id=${city.id}`)).data as any[])[0];

  // Browser A saves the tomato.
  const a = await signedInPage(browser, customerPhone, city);
  await a.goto(`${WEBSITE}/product/${product.id}`);
  const heart = a.getByRole('button', { name: 'Wishlist' });
  // The heart turns on at once; wait for the SERVER to have it before the
  // other device looks (the CI machine is slow enough to lose that race).
  await Promise.all([
    a.waitForResponse((r) => r.request().method() === 'POST' && /\/wishlist\//.test(r.url()) && r.ok()),
    heart.click(),
  ]);
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  // Browser B (a different device) shows it, then removes it.
  const b = await signedInPage(browser, customerPhone, city);
  await b.goto(`${WEBSITE}/wishlist`);
  await expect(b.getByText('Saved to your account')).toBeVisible();
  await expect(b.getByRole('link', { name: 'E2E Tomato' })).toBeVisible();
  await Promise.all([
    b.waitForResponse((r) => r.request().method() === 'DELETE' && /\/wishlist\//.test(r.url()) && r.ok()),
    b.getByRole('button', { name: 'Remove E2E Tomato from wishlist' }).click(),
  ]);
  await expect(b.getByText('Your Wishlist is Empty')).toBeVisible();

  // Browser A, opened again, does not bring it back.
  await a.goto(`${WEBSITE}/wishlist`);
  await expect(a.getByText('Your Wishlist is Empty')).toBeVisible();
  await a.goto(`${WEBSITE}/product/${product.id}`);
  await expect(a.getByRole('button', { name: 'Wishlist' })).toHaveAttribute('aria-pressed', 'false');
});
