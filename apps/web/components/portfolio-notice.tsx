import { Info } from 'lucide-react';
import { PORTFOLIO_NOTICE } from '@/lib/portfolio';

/** Top of every page: this site is a portfolio project, not Top Flow's store (lib/portfolio.ts). */
export function PortfolioNotice() {
  return (
    <aside aria-label="About this site" className="border-b border-warning-200 bg-warning-100 text-warning-900">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium sm:px-6 lg:px-8">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {PORTFOLIO_NOTICE}
      </p>
    </aside>
  );
}
