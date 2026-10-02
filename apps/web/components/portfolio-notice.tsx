import { Info } from 'lucide-react';
import { DEMO_MODE } from '@/lib/demo';
import { PORTFOLIO_NOTICE } from '@/lib/portfolio';

/**
 * Top of every page of an ordinary build: this site is a portfolio project, not Top Flow's store
 * (lib/portfolio.ts). A demo build shows the demo banner instead (components/demo-banner.tsx).
 */
export function PortfolioNotice() {
  if (DEMO_MODE) return null;
  return (
    <aside aria-label="About this site" className="border-b border-warning-200 bg-warning-100 text-warning-900">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium sm:px-6 lg:px-8">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {PORTFOLIO_NOTICE}
      </p>
    </aside>
  );
}
