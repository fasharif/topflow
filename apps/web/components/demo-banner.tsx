import { DEMO_BANNER_TEXT } from '@topflow/shared';
import { Info } from 'lucide-react';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Top of every page in demo mode: this deployment is a portfolio demo, not Top Flow's store. It takes
 * the place of the portfolio notice (components/portfolio-notice.tsx), which says the same.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <aside aria-label="About this site" className="border-b border-warning-200 bg-warning-100 text-warning-900">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium sm:px-6 lg:px-8">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        {DEMO_BANNER_TEXT}
      </p>
    </aside>
  );
}
