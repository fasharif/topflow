import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Request a quote',
  description:
    'Send your basket or describe your project, and Top Flow’s sales team will reply with a formal PDF quotation for irrigation and flow-control supplies. No account needed.',
};

/** Server layout so the client-rendered quote page can have metadata. */
export default function QuoteLayout({ children }: { children: ReactNode }) {
  return children;
}
