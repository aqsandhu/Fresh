// Browser journeys (W19). The servers are started by the caller (CI workflow
// or a local run): API, website and admin panel, all against one database
// seeded with seed.sql. URLs come from the environment.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // the journeys share one database and run in order
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-PK',
    timezoneId: 'Asia/Karachi',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    // Local runs may point at a Chromium already on the machine (CI installs its own).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
