import { ORDER_PROGRESS, ORDER_STATUS_LABELS, OrderStatus, type OrderDto, type OrderEventDto } from '@topflow/shared';
import { cx } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

function lastReached(events: OrderEventDto[], status: OrderStatus): string | null {
  const event = events.findLast((candidate) => candidate.toStatus === status);
  return event?.createdAt ?? null;
}

/** Happy-path tracker. Credit orders are released straight to "Confirmed", so the payment step only shows when it happened. */
export function OrderProgress({ order }: { order: Pick<OrderDto, 'status' | 'events'> }) {
  const hadPaymentStep = order.status === OrderStatus.PENDING_PAYMENT || order.events.some((event) => event.toStatus === OrderStatus.PENDING_PAYMENT);
  const steps = ORDER_PROGRESS.filter((step) => step !== OrderStatus.PENDING_PAYMENT || hadPaymentStep);
  const currentIndex = steps.indexOf(order.status);

  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((step, index) => {
        const done = index <= currentIndex;
        const current = index === currentIndex;
        const reachedAt = done ? lastReached(order.events, step) : null;
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className="relative flex items-center gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:text-center"
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className={cx('absolute right-1/2 top-3.5 hidden h-0.5 w-full sm:block', index <= currentIndex ? 'bg-brand-600' : 'bg-slate-200')}
              />
            )}
            <span
              className={cx(
                'relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                done ? 'bg-brand-600 text-white' : 'border-2 border-slate-200 bg-white text-slate-400',
                current && 'ring-4 ring-brand-100',
              )}
            >
              {done ? (
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="sm:mt-2 sm:px-1">
              <span className={cx('block text-sm font-medium', done ? 'text-ink-900' : 'text-slate-500')}>
                {ORDER_STATUS_LABELS[step]}
                {done && <span className="sr-only"> (completed)</span>}
              </span>
              {reachedAt && <span className="block text-xs text-slate-500">{formatDateTime(reachedAt)}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Status history, newest first. */
export function OrderTimeline({ events }: { events: OrderEventDto[] }) {
  if (events.length === 0) {
    return <p className="px-5 py-4 text-sm text-slate-500">No activity recorded yet.</p>;
  }
  const newestFirst = [...events].reverse();
  return (
    <ol className="px-5 py-4">
      {newestFirst.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < newestFirst.length - 1 && <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-slate-200" />}
          <span
            aria-hidden="true"
            className={cx('relative mt-1.5 size-[11px] shrink-0 rounded-full border-2', index === 0 ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white')}
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink-900">{ORDER_STATUS_LABELS[event.toStatus]}</p>
            <p className="text-xs text-slate-500">
              {formatDateTime(event.createdAt)}
              {event.actor && ` · ${event.actor.fullName}`}
            </p>
            {event.note && <p className="mt-1 text-slate-600">{event.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
