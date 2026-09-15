import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountNav } from '@/components/account/account-nav';
import { RequireAuth } from '@/components/require-auth';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = { title: 'My account' };

/**
 * Customer account shell. The layout itself stays a Server Component; the active-link
 * navigation and the session guard are Client Components rendered inside it.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <AccountNav />
          <div className="min-w-0">
            <RequireAuth>{children}</RequireAuth>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
