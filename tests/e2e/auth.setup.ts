import { test as setup } from '@playwright/test';
import { DEMO_ACCOUNTS, DEMO_ROLES, storageStatePath } from '../support/accounts';
import { signIn } from '../support/auth';
import { stack } from '../support/env';

// Signs every demo account in once through the sign-in form and stores its session cookies, so the
// journeys start signed in. A failure here usually means the database was not seeded with the demo
// profile or the stack is not running (see tests/README.md).
for (const role of DEMO_ROLES) {
  const account = DEMO_ACCOUNTS[role];
  setup(`sign in as ${role} (${account.email})`, async ({ page }) => {
    await signIn(page, account.email, stack.demoPassword, account.landing);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
