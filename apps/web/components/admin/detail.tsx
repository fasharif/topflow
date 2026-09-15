import { EMIRATE_LABELS, OrderChannel, RFQ_SOURCE_LABELS, RfqSource, type AddressSnapshot } from '@topflow/shared';
import type { ReactNode } from 'react';
import { Alert, Badge, Button, EmptyState, LinkButton, cx } from '@/components/ui';

/** Not part of the shared labels yet (see report) — kept local to the back office. */
export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  RETAIL: 'Retail',
  B2B: 'Trade',
};

export function ChannelBadge({ channel }: { channel: OrderChannel }) {
  return <Badge tone={channel === OrderChannel.B2B ? 'brand' : 'neutral'}>{CHANNEL_LABELS[channel]}</Badge>;
}

/** Where an RFQ came from: an organization's trade portal account, or the public website. */
export function RfqSourceBadge({ source }: { source: RfqSource }) {
  return <Badge tone={source === RfqSource.WEBSITE ? 'info' : 'brand'}>{RFQ_SOURCE_LABELS[source]}</Badge>;
}

/** `tel:` link for a number typed with spaces or dashes, e.g. "+971 50 123 4567". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** API percentages are 2dp strings: "12.50" → "12.5%", "10.00" → "10%". */
export function formatPercent(value: string): string {
  return `${value.includes('.') ? value.replace(/\.?0+$/, '') : value}%`;
}

export interface DetailItem {
  label: string;
  value: ReactNode;
  hidden?: boolean;
}

/** Label/value pairs for detail sidebars. Empty values render as an em dash. */
export function DetailList({ items, className }: { items: DetailItem[]; className?: string }) {
  return (
    <dl className={cx('divide-y divide-slate-100 text-sm', className)}>
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-ink-900">{item.value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}

export function AddressBlock({ address, fallback }: { address: AddressSnapshot | null; fallback?: string | null }) {
  if (!address) {
    return <p className="text-sm text-slate-600">{fallback || 'To be confirmed'}</p>;
  }
  return (
    <address className="text-sm not-italic leading-6 text-slate-700">
      <span className="font-medium text-ink-900">{address.contactName}</span> · {address.phoneNumber}
      <br />
      {address.line1}
      {address.line2 ? `, ${address.line2}` : ''}
      <br />
      {address.area}, {address.city}, {EMIRATE_LABELS[address.emirate]}
    </address>
  );
}

/** Small uppercase section label used inside cards. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>;
}

/** Failed `useApiQuery` result: friendly not-found / forbidden states, otherwise an alert with retry. */
export function QueryError({
  error,
  onRetry,
  title = 'Something went wrong',
  backHref,
  backLabel = 'Go back',
}: {
  error: { message: string; status: number };
  onRetry?: () => void;
  title?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const back = backHref ? (
    <LinkButton href={backHref} variant="secondary">
      {backLabel}
    </LinkButton>
  ) : undefined;
  if (error.status === 404) return <EmptyState title="Not found" description={error.message} action={back} />;
  if (error.status === 403) return <EmptyState title="You don't have access to this" description={error.message} action={back} />;
  return (
    <Alert tone="danger" title={title}>
      <p>{error.message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  );
}
