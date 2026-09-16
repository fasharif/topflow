import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/** Server layout so the client-rendered checkout page can have metadata. */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children;
}
