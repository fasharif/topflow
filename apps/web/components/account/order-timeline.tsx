import { ORDER_STATUS_LABELS, type OrderEventDto, type OrderStatus } from '@topflow/shared';
import { cx } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const LATEST_DOT_TONES: Partial<Record<OrderStatus, string>> = {
  DELIVERED: 'bg-success-500',
  CANCELLED: 'bg-danger-500',
};

/** Status history of an order, newest update first. */
export function OrderTimeline({ events, currentUserId }: { events: OrderEventDto[]; currentUserId?: string }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-600">No updates yet.</p>;
  }

  const newestFirst = [...events].reverse();

  return (
    <ol>
      {newestFirst.map((event, index) => {
        const latest = index === 0;
        const actor = event.actor ? (event.actor.id === currentUserId ? 'you' : event.actor.fullName) : null;
        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < newestFirst.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[5px] top-5 w-px bg-slate-200" />}
            <span
              aria-hidden="true"
              className={cx('relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-white', latest ? (LATEST_DOT_TONES[event.toStatus] ?? 'bg-brand-600') : 'bg-slate-300')}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className={cx('text-sm', latest ? 'font-semibold text-ink-900' : 'font-medium text-slate-700')}>{ORDER_STATUS_LABELS[event.toStatus]}</p>
                <time dateTime={event.createdAt} className="text-xs text-slate-500">
                  {formatDateTime(event.createdAt)}
                </time>
              </div>
              {event.note && <p className="mt-0.5 text-sm text-slate-600">{event.note}</p>}
              {actor && <p className="mt-0.5 text-xs text-slate-500">by {actor}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
