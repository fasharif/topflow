import { defineConfig, devices } from '@playwright/test';
import { stack } from './support/env';

const CI = Boolean(process.env.CI);

/**
 * System tests against a running stack (Supabase Auth, API, web app) seeded with the demo profile.
 * The suite does not start the servers: see tests/README.md for the local commands and
 * .github/workflows/system-tests.yml for CI.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './support/global-setup.ts',
  outputDir: './test-results',
  // The journeys share the seeded organizations (credit exposure, approval queue), so they run one
  // at a time and in file order. Accessibility scans are read-only and quick.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: './reports/playwright', open: 'never' }], ...(CI ? [['github'] as const] : [])],
  use: {
    baseURL: stack.webUrl,
    locale: 'en-GB',
    timezoneId: 'Asia/Dubai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      // Most shoppers browse on phones: the accessibility scans run again at phone size.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /accessibility\.spec\.ts/,
    },
  ],
});
