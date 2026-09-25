import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, storageStatePath, type DemoRole } from './accounts';
import { BffClient } from './bff';
import { stack } from './env';
import { Mailpit } from './mailpit';

/** A seeded demo account with its own signed-in browser context. */
export interface Actor {
  role: DemoRole;
  email: string;
  page: Page;
  context: BrowserContext;
  /** Calls through the web app's /api handler with this actor's session cookies. */
  api: BffClient;
}

interface Fixtures {
  /**
   * Opens a browser context signed in as a demo account (sessions come from auth.setup.ts).
   * Several actors can take turns in one test, like colleagues on their own laptops.
   */
  actAs: (role: DemoRole) => Promise<Actor>;
  mailpit: Mailpit;
}

export const test = base.extend<Fixtures>({
  actAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const context = await browser.newContext({ baseURL: stack.webUrl, storageState: storageStatePath(role) });
      contexts.push(context);
      const page = await context.newPage();
      return { role, email: DEMO_ACCOUNTS[role].email, page, context, api: new BffClient(context.request) };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  mailpit: async ({ request }, use) => {
    await use(new Mailpit(request));
  },
});

export { expect } from '@playwright/test';
