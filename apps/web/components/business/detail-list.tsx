import { EMIRATE_LABELS, type AddressSnapshot } from '@topflow/shared';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

/** Label/value pairs. `stacked` suits narrow sidebars; the default lays out two columns from `sm`. */
export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cx('divide-y divide-slate-200 text-sm', className)}>{children}</dl>;
}

export function DetailItem({ label, children, stacked = false }: { label: string; children?: ReactNode; stacked?: boolean }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={cx('px-5 py-3', stacked ? 'space-y-0.5' : 'grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4')}>
      <dt className="text-slate-600">{label}</dt>
      <dd className={cx('min-w-0 break-words', empty ? 'text-slate-500' : 'text-ink-900')}>{empty ? '—' : children}</dd>
    </div>
  );
}

/** Delivery address snapshot as stored on RFQs and orders, with a plain-text fallback. */
export function AddressBlock({ address, fallback }: { address: AddressSnapshot | null; fallback?: string | null }) {
  if (!address) {
    return fallback ? <span>{fallback}</span> : <span className="text-slate-600">To be confirmed</span>;
  }
  return (
    <address className="not-italic leading-relaxed">
      <span className="font-medium text-ink-900">{address.label}</span>
      <br />
      {[address.line1, address.line2].filter(Boolean).join(', ')}
      <br />
      {address.area}, {address.city}, {EMIRATE_LABELS[address.emirate]}
      <br />
      <span className="text-slate-500">
        {address.contactName} · {address.phoneNumber}
      </span>
    </address>
  );
}

/** Multi-line free text (notes, terms) with preserved line breaks. */
export function Prose({ children }: { children: string }) {
  return <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{children}</p>;
}
