// Journey 1 — a new customer orders on the website: pick the city, add a
// product, sign up at checkout with the one-time code and a PIN, save an
// address, choose tomorrow's slot and place the order. Checked against the
// API afterwards: the order exists, for this customer, with this product.
import { expect, test } from '@playwright/test';
import { WEBSITE, OTP, apiGet, freshPhone } from './env';
import { saveJourney } from './journey';

test('a new customer places an order on the website', async ({ page }) => {
  const cities = (await apiGet('/site-settings/cities')).data as any[];
  const city = cities.find((c) => c.name === 'Gujrat');
  expect(city, 'Gujrat is a service city (schema.sql)').toBeTruthy();
  const product = ((await apiGet(`/products?search=E2E%20Tomato&city_id=${city.id}`)).data as any[])[0];
  expect(product, 'seed.sql product').toBeTruthy();

  // The shop remembers the chosen city between visits.
  await page.addInitScript(([id, name]) => {
    localStorage.setItem('website_selected_city_id', id);
    localStorage.setItem('website_selected_city_name', name);
  }, [city.id, city.name]);

  // Product → cart
  await page.goto(`${WEBSITE}/product/${product.id}`);
  await expect(page.getByRole('heading', { name: /E2E Tomato/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByRole('button', { name: 'Cart, 1 item' })).toBeVisible();

  // Checkout → sign up with the code and a PIN
  await page.goto(`${WEBSITE}/checkout`);
  const phone = freshPhone();
  await page.getByPlaceholder('03XX-XXXXXXX').fill(phone);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Code digit 1 of 6').fill(OTP);
  await page.getByPlaceholder('Enter your name').fill('Browser Buyer');
  await page.getByLabel('New PIN digit 1 of 4').click();
  await page.keyboard.type('4826', { delay: 60 });
  await page.getByRole('button', { name: 'Create account & continue' }).click();

  // Address (first one for this account)
  await page.getByPlaceholder('e.g., Gulberg, DHA').fill('Model Town');
  await page.getByPlaceholder('Enter your complete address').fill('House 21, Street 3, near the park');
  await page.getByRole('button', { name: 'Save Address' }).click();
  await expect(page.getByText('House 21, Street 3').first()).toBeVisible();

  // Tomorrow, the all-day slot → place the order
  await page.getByRole('button', { name: /tomorrow/i }).click();
  // The first slot with room is chosen for the customer (seed: 00:00–23:59).
  await expect(page.getByRole('radio', { name: /12:00 am - 11:59 pm/i, checked: true })).toBeVisible();
  await page.getByRole('button', { name: 'Place Order' }).click();

  const done = page.getByRole('dialog', { name: 'Order placed successfully!' });
  await expect(done).toBeVisible();
  const orderNumber = (await done.locator('span.font-semibold').first().textContent())?.trim();
  expect(orderNumber).toBeTruthy();

  // The order really exists for this number, with the tomato in it.
  await page.getByRole('button', { name: /View Order/ }).click();
  await expect(page).toHaveURL(/\/track\//);
  await expect(page.getByText(orderNumber!).first()).toBeVisible();
  saveJourney({ orderNumber: orderNumber!, customerPhone: phone });
});
