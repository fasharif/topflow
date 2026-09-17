import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LucideProvider } from 'lucide-react';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { SessionBootstrap } from '@/components/session-bootstrap';
import { SITE_URL } from '@/lib/site';
import './globals.css';

// Plex Sans is a variable font: one file covers the 400–700 weights the interface uses.
const plexSans = IBM_Plex_Sans({ variable: '--font-plex-sans', subsets: ['latin'], display: 'swap' });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' });

const TITLE = 'Top Flow Hub — Irrigation & flow-control supplies, UAE';
const DESCRIPTION =
  'TopFlow Hub is Top Flow’s supply platform for irrigation and flow-control products in the UAE: electrofusion and HDPE fittings, sprinklers and rotors, drip irrigation, valves and controllers, filtration, pumps, fertigation, greenhouse supplies and hoses. See approximate prices including VAT and request a formal quotation.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · Top Flow Hub' },
  description: DESCRIPTION,
  applicationName: 'TopFlow Hub',
  openGraph: { type: 'website', siteName: 'Top Flow Hub', locale: 'en_AE', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

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
        <SessionBootstrap />
        <LucideProvider strokeWidth={1.75}>{children}</LucideProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
