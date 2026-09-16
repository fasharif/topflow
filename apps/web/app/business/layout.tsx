import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { BusinessShell } from '@/components/business/business-shell';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { Container } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Trade portal',
  description: 'Request quotations, approve purchases and track orders for your business.',
};

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60vh] py-8 sm:py-10">
        <Container>
          <BusinessShell>{children}</BusinessShell>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
