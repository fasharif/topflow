import { expect, type Page } from '@playwright/test';

/**
 * Waits until a client-rendered page has loaded its data: no pending requests and no loading
 * indicator (LoadingBlock renders role="status" with "Loading…").
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('status').filter({ hasText: /Loading|Looking up/ })).toHaveCount(0);
}

/** Opens a page and waits for its data, failing on a server error page. */
export async function open(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status() ?? 0, `GET ${path}`).toBeLessThan(500);
  await settle(page);
}
