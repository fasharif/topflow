import { ORDER_PROGRESS, ORDER_STATUS_LABELS, OrderStatus, type OrderDto } from '@topflow/shared';
import { cx } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';

type StepState = 'complete' | 'current' | 'upcoming' | 'cancelled';

interface Step {
  key: string;
  label: string;
  state: StepState;
  date?: string;
  hint?: string;
}

type ProgressOrder = Pick<OrderDto, 'status' | 'events' | 'createdAt' | 'cancelledAt' | 'cancellationReason'>;

const CURRENT_HINTS: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Preparation starts shortly',
  PROCESSING: 'Being picked and packed',
  DISPATCHED: 'On its way to you',
};

const SR_PREFIX: Record<StepState, string> = {
  complete: 'Completed: ',
  current: 'Current step: ',
  upcoming: 'Upcoming: ',
  cancelled: '',
};

const LABEL_TONES: Record<StepState, string> = {
  complete: 'font-semibold text-ink-900',
  current: 'font-semibold text-brand-700',
  upcoming: 'text-slate-500',
  cancelled: 'font-semibold text-red-700',
};

const CONNECTOR_TONES: Record<StepState, string> = {
  complete: 'bg-brand-600',
  current: 'bg-brand-600',
  upcoming: 'bg-slate-200',
  cancelled: 'bg-red-200',
};

function buildSteps(order: ProgressOrder): Step[] {
  const reached = new Set<OrderStatus>([order.status]);
  for (const event of order.events) {
    reached.add(event.toStatus);
    if (event.fromStatus) reached.add(event.fromStatus);
  }
  const dateOf = (status: OrderStatus) => order.events.find((event) => event.toStatus === status)?.createdAt;
  const cancelled = order.status === OrderStatus.CANCELLED;
  const cancelledStep: Step = { key: OrderStatus.CANCELLED, label: ORDER_STATUS_LABELS.CANCELLED, state: 'cancelled', date: order.cancelledAt ?? dateOf(OrderStatus.CANCELLED) };

  const reachedIndexes = ORDER_PROGRESS.flatMap((status, index) => (reached.has(status) ? [index] : []));
  if (reachedIndexes.length === 0) return cancelled ? [cancelledStep] : [];

  const first = reachedIndexes[0];
  const last = reachedIndexes[reachedIndexes.length - 1];

  // Steps before the order's first status never applied (pay-on-delivery orders start out confirmed),
  // and a cancelled order only shows how far it got.
  const steps = ORDER_PROGRESS.slice(first, cancelled ? last + 1 : undefined).map((status, offset): Step => {
    const index = first + offset;
    const state: StepState =
      cancelled || index < last || status === OrderStatus.DELIVERED ? 'complete' : index === last ? 'current' : 'upcoming';
    return {
      key: status,
      label: ORDER_STATUS_LABELS[status],
      state,
      date: state === 'upcoming' ? undefined : (dateOf(status) ?? (index === first ? order.createdAt : undefined)),
      hint: state === 'current' ? CURRENT_HINTS[status] : undefined,
    };
  });
  return cancelled ? [...steps, cancelledStep] : steps;
}

function StepMarker({ state }: { state: StepState }) {
  const base = 'relative grid size-8 shrink-0 place-items-center rounded-full';
  if (state === 'complete' || state === 'cancelled') {
    return (
      <span aria-hidden="true" className={cx(base, 'text-white shadow-sm', state === 'complete' ? 'bg-brand-600' : 'bg-red-600')}>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={state === 'complete' ? 'm5 12.5 4.5 4.5L19 7.5' : 'M7 7l10 10M17 7 7 17'} />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cx(base, 'bg-white ring-2 ring-inset', state === 'current' ? 'ring-brand-600' : 'ring-slate-200')}>
      <span className={cx('rounded-full', state === 'current' ? 'size-2.5 bg-brand-600' : 'size-2 bg-slate-300')} />
    </span>
  );
}

/** Horizontal tracker on larger screens, vertical on phones. */
export function OrderProgress({ order }: { order: ProgressOrder }) {
  const steps = buildSteps(order);

  return (
    <div className="space-y-5">
      <ol aria-label="Order progress" className="flex flex-col sm:flex-row">
        {steps.map((step, index) => {
          const next = steps[index + 1];
          return (
            <li
              key={step.key}
              aria-current={step.state === 'current' ? 'step' : undefined}
              className="relative flex gap-3 pb-6 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
            >
              {next && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute bottom-1 left-4 top-9 w-0.5 -translate-x-1/2 sm:bottom-auto sm:left-[calc(50%+1.5rem)] sm:right-[calc(-50%+1.5rem)] sm:top-4 sm:h-0.5 sm:w-auto sm:translate-x-0 sm:-translate-y-1/2',
                    CONNECTOR_TONES[next.state],
                  )}
                />
              )}
              <StepMarker state={step.state} />
              <div className="min-w-0 pt-1 sm:pt-0">
                <p className={cx('text-sm', LABEL_TONES[step.state])}>
                  <span className="sr-only">{SR_PREFIX[step.state]}</span>
                  {step.label}
                </p>
                {step.date && <p className="text-xs text-slate-500">{formatDate(step.date)}</p>}
                {step.hint && <p className="text-xs text-slate-500">{step.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {order.status === OrderStatus.CANCELLED && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">This order was cancelled{order.cancelledAt ? ` on ${formatDateTime(order.cancelledAt)}` : ''}.</p>
          {order.cancellationReason && <p className="mt-1">Reason: {order.cancellationReason}</p>}
        </div>
      )}
    </div>
  );
}
