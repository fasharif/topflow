import { expect, type Page } from '@playwright/test';

/** Signs in through the real sign-in form (Server Action → Supabase Auth → httpOnly cookies). */
export async function signIn(page: Page, email: string, password: string, landing: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page
    .waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 })
    .catch(async () => {
      const alert = await page.getByRole('alert').allInnerTexts();
      throw new Error(`Sign-in as ${email} did not complete${alert.length ? `: ${alert.join(' ')}` : ''}. Is the demo profile seeded?`);
    });
  if (new URL(page.url()).pathname.startsWith('/auth/mfa')) {
    throw new Error(
      `${email} was asked for a second factor. Run the API with STAFF_MFA_REQUIRED=false for the system tests; ` +
        'staff MFA is covered by the API end-to-end suite.',
    );
  }
  await expect(page).toHaveURL(new RegExp(`${landing}(\\?|$|/)`));
}
