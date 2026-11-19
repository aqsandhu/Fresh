// Journey 2 — the office fulfils the order from journey 1 in the admin panel:
// sign in (password + code), find the order, move it confirmed → preparing →
// ready, assign the rider; the rider (mobile app = API here) picks it up and
// delivers; the office list then shows it delivered.
import { expect, test, type Page } from '@playwright/test';
import { API } from './env';
import { adminSignIn } from './adminSignIn';
import { readJourney } from './journey';

const RIDER_PHONE = '03480000001'; // seed.sql
const RIDER_PASSWORD = 'rider123';

async function riderCall(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function findOrderRow(page: Page, orderNumber: string) {
  await page.getByPlaceholder('Search orders...').first().fill(orderNumber);
  const row = page.getByRole('row').filter({ hasText: orderNumber });
  await expect(row).toHaveCount(1);
  return row;
}

test('the office fulfils the order and the rider delivers it', async ({ page }) => {
  const { orderNumber } = readJourney();
  test.skip(!orderNumber, 'journey 1 did not place an order');

  // Sign in: password, then the one-time code.
  await adminSignIn(page);

  await page.getByRole('link', { name: /^Orders/ }).click();
  let row = await findOrderRow(page, orderNumber);
  await expect(row.getByText('Pending')).toBeVisible();

  // Each "Update" offers the next step first.
  for (const next of ['Confirmed', 'Preparing', 'Ready For Pickup']) {
    await row.getByRole('button', { name: 'Update' }).click();
    const dialog = page.getByRole('dialog', { name: 'Update Order Status' });
    await expect(dialog.getByLabel('New Status')).toHaveValue(/.+/);
    await expect(dialog.getByLabel('New Status').locator('option:checked')).toHaveText(next);
    await dialog.getByRole('button', { name: 'Update Status' }).click();
    await expect(dialog).toBeHidden();
    row = await findOrderRow(page, orderNumber);
    await expect(row.getByText(next, { exact: true })).toBeVisible();
  }

  // Assign the seeded rider from the row.
  const riderBox = row.getByRole('combobox', { name: `Assign a rider to order ${orderNumber}` });
  const riderOption = riderBox.locator('option', { hasText: 'Journey Rider' });
  await riderBox.selectOption({ value: (await riderOption.getAttribute('value'))! });
  await expect(page.getByText(/Rider assigned/).first()).toBeVisible();

  // The rider app: sign in, see the task, pick up, deliver.
  const login = await riderCall('POST', '/rider/login', undefined, { phone: RIDER_PHONE, password: RIDER_PASSWORD });
  const riderToken = login.body?.data?.tokens?.accessToken || login.body?.data?.token;
  expect(riderToken, 'rider signs in').toBeTruthy();
  const tasks = (await riderCall('GET', '/rider/tasks/active', riderToken)).body?.data as any[];
  const task = tasks.find((t) => t.order_number === orderNumber || t.orderNumber === orderNumber) || tasks[0];
  expect(task, 'the rider has the task').toBeTruthy();
  expect((await riderCall('PUT', `/rider/tasks/${task.id}/pickup`, riderToken, {})).status).toBe(200);
  expect((await riderCall('PUT', `/rider/tasks/${task.id}/deliver`, riderToken, { notes: 'browser journey' })).status).toBe(200);

  // The office sees it delivered.
  await page.reload();
  row = await findOrderRow(page, orderNumber);
  await expect(row.getByText('Delivered', { exact: true })).toBeVisible();
});
