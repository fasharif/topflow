import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';

/**
 * Horizontal scroll container for content wider than the screen, such as tables on phones. It can
 * be focused and scrolled with the arrow keys, and screen readers announce it by `label`
 * (WCAG 2.1.1 Keyboard; axe rule scrollable-region-focusable).
 */
export function ScrollRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cx('overflow-x-auto', className)}>
      {children}
    </div>
  );
}

/** Data table in a card. `label` names its scroll region for keyboard and screen-reader users. */
export function Table({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <ScrollRegion label={label} className={cx('rounded-xl border border-slate-200 bg-white shadow-xs', className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </ScrollRegion>
  );
}

export function Th({ children, className, scope = 'col' }: { children?: ReactNode; className?: string; scope?: 'col' | 'row' }) {
  return (
    <th scope={scope} className={cx('eyebrow bg-slate-50 px-4 py-3 text-slate-600', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cx('border-t border-slate-200 px-4 py-3 align-middle', className)}>
      {children}
    </td>
  );
}

/** Page numbers around the current page, with gaps marked as null. */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

/** Previous/next pagination for client-side lists. */
export function Pagination({
  page,
  totalPages,
  onPage,
  className,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={cx('mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600', className)}>
      <p>
        Page <span className="font-medium text-ink-900">{page}</span> of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

const pageLink = 'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium tabular-nums transition-colors';

/** Numbered pagination with links, for server-rendered lists such as the catalogue. */
export function PaginationLinks({
  page,
  totalPages,
  hrefFor,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const idle = 'border border-slate-300 bg-white text-ink-900 hover:border-slate-400 hover:bg-slate-50';
  return (
    <nav aria-label="Pagination" className={cx('flex justify-center', className)}>
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        {page > 1 && (
          <li>
            <Link href={hrefFor(page - 1)} className={cx(pageLink, idle)}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              Previous
            </Link>
          </li>
        )}
        {pageWindow(page, totalPages).map((item, index) =>
          item === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-slate-500">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                className={cx(pageLink, item === page ? 'bg-ink-900 text-white' : idle)}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        {page < totalPages && (
          <li>
            <Link href={hrefFor(page + 1)} className={cx(pageLink, idle)}>
              Next
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
