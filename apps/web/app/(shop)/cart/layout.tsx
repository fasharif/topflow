import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Basket',
  robots: { index: false, follow: true },
};

/** Server layout so the client-rendered basket page can have metadata. */
export default function BasketLayout({ children }: { children: ReactNode }) {
  return children;
}
