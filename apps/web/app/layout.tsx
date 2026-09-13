import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SessionBootstrap } from '@/components/session-bootstrap';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Top Flow — Irrigation & Flow Control Supplies',
    template: '%s · Top Flow',
  },
  description:
    'Sprinklers, drip irrigation, valves, controllers, pipes and pumps for homeowners, landscapers and contractors across the UAE — shop online or request a trade quotation.',
  applicationName: 'Top Flow',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <SessionBootstrap />
        {children}
      </body>
    </html>
  );
}
