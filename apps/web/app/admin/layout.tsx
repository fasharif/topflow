import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/admin-nav';
import { RequireAuth } from '@/components/require-auth';
import { SiteHeader } from '@/components/site-header';
import { Container } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Back office',
  robots: { index: false, follow: false },
};

/** Staff back office shell: storefront header, permission-aware sidebar, then the page. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* <main> wraps the guard so the skip link has a target while the session is being checked. */}
      <main id="main">
        <Container className="min-h-[70vh] py-6 lg:py-8">
          <RequireAuth staff>
            <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
              <div className="lg:sticky lg:top-32 lg:self-start">
                <AdminNav />
              </div>
              <div className="min-w-0">{children}</div>
            </div>
          </RequireAuth>
        </Container>
      </main>
    </>
  );
}
