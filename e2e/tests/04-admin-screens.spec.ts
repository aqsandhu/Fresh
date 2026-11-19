// Journey 4 — the admin's biggest popups in a real browser: the product form
// (add: refused when empty; edit: the full product loads, a change is saved
// and comes back) and the order details of journey 1's order, with the rider
// tracking popup on top.
import { expect, test } from '@playwright/test';
import { adminSignIn } from './adminSignIn';
import { readJourney } from './journey';

test('the product form: an empty product is refused, an edit is saved and loads again', async ({ page }) => {
  await adminSignIn(page);
  await page.getByRole('link', { name: 'Catalog', exact: true }).click(); // opens on the Products tab
  await page.getByPlaceholder('Search products...').first().fill('E2E Tomato');
  await expect(page.getByRole('heading', { name: 'E2E Tomato' })).toBeVisible();

  // Add: nothing typed → the reasons, nothing sent.
  await page.getByRole('button', { name: 'Add Product' }).first().click();
  const add = page.getByRole('dialog', { name: 'Add Product' });
  await add.getByRole('button', { name: 'Create' }).click();
  await expect(add.getByText('Product name (English) is required')).toBeVisible();
  await expect(add.getByText('Please select a category')).toBeVisible();
  await add.getByRole('button', { name: 'Cancel' }).click();
  await expect(add).toBeHidden();

  // Edit: the stored product loads; a new description is saved.
  const note = `Checked by the browser journey ${Date.now()}`;
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  let edit = page.getByRole('dialog', { name: 'Edit Product' });
  await expect(edit.getByLabel('Product Name (English)')).toHaveValue('E2E Tomato');
  await edit.getByLabel('Description').fill(note);
  await edit.getByRole('button', { name: 'Update' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Product updated successfully').first()).toBeVisible();

  // Opening it again shows the saved text (a fresh form, loaded from the server).
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  edit = page.getByRole('dialog', { name: 'Edit Product' });
  await expect(edit.getByLabel('Description')).toHaveValue(note);
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();
});

test("the order details of journey 1's order, and the rider's position", async ({ page }) => {
  const { orderNumber } = readJourney();
  test.skip(!orderNumber, 'journey 1 did not place an order');
  await adminSignIn(page);
  await page.getByRole('link', { name: /^Orders/ }).click();
  await page.getByPlaceholder('Search orders...').first().fill(orderNumber);
  const row = page.getByRole('row').filter({ hasText: orderNumber });
  await expect(row).toHaveCount(1);

  await row.getByRole('button', { name: 'View' }).click();
  const details = page.getByRole('dialog', { name: `Order ${orderNumber}` });
  await expect(details.getByText('E2E Tomato').first()).toBeVisible();
  await expect(details.getByRole('button', { name: 'Print Slip' })).toBeVisible();

  // Journey 2 gave the order to the seeded rider → the position can be opened.
  await details.getByRole('button', { name: 'Track Rider Live Location' }).click();
  const tracking = page.getByRole('dialog', { name: /^Track Rider: / });
  await expect(tracking).toBeVisible();
  await expect(
    tracking.getByText('Location data not available for this rider.').or(tracking.getByText('Open in Google Maps')),
  ).toBeVisible();
  await tracking.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(tracking).toBeHidden();

  await details.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(details).toBeHidden();
});
