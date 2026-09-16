import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountNav } from '@/components/account/account-nav';
import { RequireAuth } from '@/components/require-auth';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Container } from '@/components/ui';

export const metadata: Metadata = { title: 'My account' };

/**
 * Customer account shell. The layout itself stays a Server Component; the active-link
 * navigation and the session guard are Client Components rendered inside it.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 py-8 sm:py-10">
        <Container className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <AccountNav />
          <div className="min-w-0">
            <RequireAuth>{children}</RequireAuth>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
