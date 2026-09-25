/**
 * The public portfolio demo (ADR-021). A demo deployment runs the production code with its demo
 * setting switched on: `DEMO_MODE` in the API and `NEXT_PUBLIC_DEMO_MODE` in the web app.
 */

/** Shown at the top of every page of the web app in demo mode. */
export const DEMO_BANNER_TEXT = "Portfolio demo: data resets every night. This is not Top Flow's official store.";

/**
 * Password of every published demo account. It is public on purpose: visitors sign in with it, the
 * data is fictional, and the nightly reset (`npm run demo:reset`) restores it if someone changes it.
 */
export const DEMO_ACCOUNT_PASSWORD = 'TopFlow2026!';

export interface DemoAccount {
  email: string;
  /** Who the account belongs to in the demo story. */
  label: string;
  /** What a visitor can try with it. */
  tryThis: string;
}

/**
 * Accounts created by the demo seed (`npm run db:seed`) and published in the README and on the demo's
 * sign-in page. In demo mode the API keeps them usable for every visitor: their role cannot be changed
 * and they cannot be suspended.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'customer@example.com', label: 'Retail customer', tryThis: 'Checkout and order tracking' },
  { email: 'buyer@desertbloom.ae', label: 'Trade buyer (AED 5,000 limit)', tryThis: 'RFQs and accepting quotations' },
  { email: 'approver@desertbloom.ae', label: 'Trade approver (AED 50,000 limit)', tryThis: "Approving purchases above the buyer's limit" },
  { email: 'owner@desertbloom.ae', label: 'Trade owner', tryThis: 'Team invitations, delivery sites and the company profile' },
  { email: 'sales@topflow.ae', label: 'Top Flow sales', tryThis: 'KYC, RFQ triage and the quotation builder' },
  { email: 'warehouse@topflow.ae', label: 'Top Flow warehouse', tryThis: 'Fulfilment and stock' },
  { email: 'admin@topflow.ae', label: 'Administrator', tryThis: 'Everything, including users and the audit trail' },
];

/** True when the address belongs to one of the published demo accounts (case-insensitive). */
export function isDemoAccount(email: string): boolean {
  const address = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.some((account) => account.email === address);
}

const TRUE_VALUES = new Set(['true', '1']);
const FALSE_VALUES = new Set(['false', '0', '']);

/**
 * Reads a demo-mode setting. Unset or empty means off; `true`/`1` and `false`/`0` are accepted.
 * Anything else throws, so a typo such as `DEMO_MODE=yes` stops the app at boot instead of silently
 * running a public deployment without its demo safeguards.
 */
export function parseDemoModeFlag(value: string | undefined, name = 'DEMO_MODE'): boolean {
  const normalised = (value ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(normalised)) return true;
  if (FALSE_VALUES.has(normalised)) return false;
  throw new Error(`Invalid environment configuration: ${name} must be "true" or "false" (got "${value}").`);
}
