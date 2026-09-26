import path from 'node:path';
import { DEMO_ACCOUNTS as PUBLISHED_ACCOUNTS, DEMO_ORGANIZATION } from '@topflow/shared';

/**
 * The published demo account whose address starts with `localPart@` (and ends with `@domain`
 * when given). The addresses come from @topflow/shared, the list the seed, the README and the
 * demo's sign-in page use, so the suite follows any change to them.
 */
function published(localPart: string, domain?: string): string {
  const account = PUBLISHED_ACCOUNTS.find(({ email }) => email.startsWith(`${localPart}@`) && (domain === undefined || email.endsWith(`@${domain}`)));
  if (!account) throw new Error(`No published demo account "${localPart}@…" in @topflow/shared (DEMO_ACCOUNTS)`);
  return account.email;
}

/** Domain of the demo company's published accounts (buyer, approver, owner). */
const DEMO_COMPANY_DOMAIN = published('buyer').split('@')[1] ?? '';

/**
 * Accounts created by `npm run db:seed` with the demo profile (packages/database/prisma/seed.ts).
 * Desert Bloom is an active trade customer on Net 30 credit; Al Waha waits in the KYC queue. Al
 * Waha's owner is seeded but not published, so its address is the one in seed.ts.
 */
export const DEMO_ACCOUNTS = {
  customer: { email: published('customer'), landing: '/account', name: 'Sara Ahmed' },
  buyer: { email: published('buyer'), landing: '/business', name: 'Joseph Mathew' },
  approver: { email: published('approver'), landing: '/business', name: 'Fatima Noor' },
  owner: { email: published('owner', DEMO_COMPANY_DOMAIN), landing: '/business', name: 'Khalid Al Mansoori' },
  rivalOwner: { email: 'owner@alwaha.example', landing: '/business', name: 'Hamad Al Suwaidi' },
  sales: { email: published('sales'), landing: '/admin', name: 'Omar Haddad' },
  warehouse: { email: published('warehouse'), landing: '/admin', name: 'Ravi Menon' },
  admin: { email: published('admin'), landing: '/admin', name: 'Aisha Rahman' },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export const DEMO_ROLES = Object.keys(DEMO_ACCOUNTS) as DemoRole[];

/** Seeded commercial terms the money paths rely on (seed.ts, seedDemoAccounts). */
export const DESERT_BLOOM = {
  name: DEMO_ORGANIZATION.name,
  buyerLimit: '5000.00',
  approverLimit: '50000.00',
  creditLimit: '250000.00',
} as const;

export const AL_WAHA = { name: 'Al Waha Facility Management LLC' } as const;

/** Signed-in browser state per role, written by e2e/auth.setup.ts (git-ignored). */
export function storageStatePath(role: DemoRole): string {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}
