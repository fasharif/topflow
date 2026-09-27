import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LucideProvider } from 'lucide-react';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { DemoBanner } from '@/components/demo-banner';
import { SessionBootstrap } from '@/components/session-bootstrap';
import { SITE_URL } from '@/lib/site';
import { siteMetadata } from '@/lib/site-metadata';
import './globals.css';

// Plex Sans is a variable font: one file covers the 400–700 weights the interface uses.
const plexSans = IBM_Plex_Sans({ variable: '--font-plex-sans', subsets: ['latin'], display: 'swap' });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

// A demo build names itself a portfolio demo in every title and link preview, and asks not to be indexed.
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
        <DemoBanner />
        <SessionBootstrap />
        <LucideProvider strokeWidth={1.75}>{children}</LucideProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
