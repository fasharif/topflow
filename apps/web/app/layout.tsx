import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, IBM_Plex_Mono } from 'next/font/google';
import { SessionBootstrap } from '@/components/session-bootstrap';
import './globals.css';

const archivo = Archivo({ variable: '--font-archivo', subsets: ['latin'] });
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] });
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'] });

export const metadata: Metadata = {
  title: {
    default: 'Top Flow — Irrigation & Flow Control Supplies, UAE',
    template: '%s · Top Flow',
  },
  description:
    'Irrigation and flow-control supply in the UAE: electrofusion fittings, sprinklers and rotors, drip irrigation, pipes, valves, filtration and landscaping products. Shop online or request a formal quotation.',
  applicationName: 'Top Flow',
  openGraph: { siteName: 'Top Flow', type: 'website', locale: 'en_AE' },
};

export const viewport: Viewport = {
  themeColor: '#faf8f3',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${archivo.variable} ${fraunces.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans">
        <SessionBootstrap />
        {children}
      </body>
    </html>
  );
}
