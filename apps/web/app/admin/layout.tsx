import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/admin-nav';
import { RequireAuth } from '@/components/require-auth';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Back office',
  robots: { index: false, follow: false },
};

/** Staff back office shell: storefront header, permission-aware sidebar, then the page. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto min-h-[70vh] max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <RequireAuth staff>
          <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <AdminNav />
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
        </RequireAuth>
      </div>
    </>
  );
}
