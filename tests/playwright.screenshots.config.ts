import { defineConfig } from '@playwright/test';
import { stack } from './support/env';

/**
 * Captures the README screenshots (docs/screenshots/*.png) and records the walkthrough video that
 * scripts/walkthrough-gif.sh turns into a GIF. Run against a stack seeded with the demo profile:
 *
 *   npm run screenshots -w @topflow/system-tests
 */
export default defineConfig({
  testDir: './screenshots',
  testMatch: /\.capture\.ts$/,
  globalSetup: './support/global-setup.ts',
  outputDir: './test-results/screenshots',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: stack.webUrl,
    locale: 'en-GB',
    timezoneId: 'Asia/Dubai',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  },
  projects: [
    { name: 'setup', testDir: './e2e', testMatch: /auth\.setup\.ts/ },
    { name: 'capture', dependencies: ['setup'] },
  ],
});
