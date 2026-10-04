import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LucideProvider } from 'lucide-react';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { DemoBanner } from '@/components/demo-banner';
import { PortfolioNotice } from '@/components/portfolio-notice';
import { SessionBootstrap } from '@/components/session-bootstrap';
import { SITE_URL } from '@/lib/site';
import { siteMetadata } from '@/lib/site-metadata';
import { onVercel } from '@/lib/vercel';
import './globals.css';

// Plex Sans is a variable font: one file covers the 400–700 weights the interface uses.
const plexSans = IBM_Plex_Sans({ variable: '--font-plex-sans', subsets: ['latin'], display: 'swap' });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

// Every build describes itself as a portfolio project in its description and link previews (a demo build
// also names itself a portfolio demo in every title), and asks not to be indexed (lib/site-metadata.ts,
// ADR-021, ADR-023).
export const metadata: Metadata = siteMetadata(SITE_URL);

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-900 focus:shadow-lg"
        >
          Skip to main content
        </a>
        {/* One notice per page: the demo banner in a demo build, the portfolio notice in every other. */}
        <DemoBanner />
        <PortfolioNotice />
        <SessionBootstrap />
        <LucideProvider strokeWidth={1.75}>{children}</LucideProvider>
        {/* Their scripts are served only on Vercel (lib/vercel.ts). */}
        {onVercel() && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
