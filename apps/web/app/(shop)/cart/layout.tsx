import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  // Inherits noindex, nofollow from the root layout, as every page does (ADR-023).
  title: 'Basket',
};

/** Server layout so the client-rendered basket page can have metadata. */
export default function BasketLayout({ children }: { children: ReactNode }) {
  return children;
}
