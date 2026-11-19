// Sign in to the admin panel: password, then the one-time code (test API only).
import { expect, type Page } from '@playwright/test';
import { ADMIN, ADMIN_PASSWORD, ADMIN_PHONE, OTP } from './env';

export async function adminSignIn(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByPlaceholder('+923001234567').fill(ADMIN_PHONE);
  await page.getByPlaceholder('Enter your password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByPlaceholder('6-digit code').fill(OTP);
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}
