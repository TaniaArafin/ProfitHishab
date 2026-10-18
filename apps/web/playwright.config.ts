import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * End-to-end path required by SRS section 10. Locally it reuses the dev servers if they are
 * running; in CI it starts the built API and web app itself.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Dev mode compiles each page on first visit; CI runs the production build and stays strict.
  timeout: process.env.CI ? 30_000 : 120_000,
  expect: { timeout: process.env.CI ? 5_000 : 30_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(process.env.CI ? {} : { channel: 'chrome' }) } },
    { name: 'phone', use: { ...devices['Pixel 7'], ...(process.env.CI ? {} : { channel: 'chrome' }) } },
  ],
  webServer: [
    {
      command: 'npm run start -w @ph/api',
      cwd: '../..',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    { command: 'npm run start -w @ph/web', cwd: '../..', url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
