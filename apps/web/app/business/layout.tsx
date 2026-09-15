import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { BusinessShell } from '@/components/business/business-shell';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Trade portal',
  description: 'Request quotations, approve purchases and track orders for your business.',
};

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-8 sm:px-6">
        <BusinessShell>{children}</BusinessShell>
      </main>
      <SiteFooter />
    </>
  );
}
