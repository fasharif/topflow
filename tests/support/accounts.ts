import path from 'node:path';

/**
 * Accounts created by `npm run db:seed` with the demo profile (packages/database/prisma/seed.ts).
 * Desert Bloom is an active trade customer on Net 30 credit; Al Waha waits in the KYC queue.
 */
export const DEMO_ACCOUNTS = {
  customer: { email: 'customer@example.com', landing: '/account', name: 'Sara Ahmed' },
  buyer: { email: 'buyer@desertbloom.ae', landing: '/business', name: 'Joseph Mathew' },
  approver: { email: 'approver@desertbloom.ae', landing: '/business', name: 'Fatima Noor' },
  owner: { email: 'owner@desertbloom.ae', landing: '/business', name: 'Khalid Al Mansoori' },
  rivalOwner: { email: 'owner@alwaha.ae', landing: '/business', name: 'Hamad Al Suwaidi' },
  sales: { email: 'sales@topflow.ae', landing: '/admin', name: 'Omar Haddad' },
  warehouse: { email: 'warehouse@topflow.ae', landing: '/admin', name: 'Ravi Menon' },
  admin: { email: 'admin@topflow.ae', landing: '/admin', name: 'Aisha Rahman' },
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export const DEMO_ROLES = Object.keys(DEMO_ACCOUNTS) as DemoRole[];

/** Seeded commercial terms the money paths rely on (seed.ts, seedDemoAccounts). */
export const DESERT_BLOOM = {
  name: 'Desert Bloom Landscaping LLC',
  buyerLimit: '5000.00',
  approverLimit: '50000.00',
  creditLimit: '250000.00',
} as const;

export const AL_WAHA = { name: 'Al Waha Facility Management LLC' } as const;

/** Signed-in browser state per role, written by e2e/auth.setup.ts (git-ignored). */
export function storageStatePath(role: DemoRole): string {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}
