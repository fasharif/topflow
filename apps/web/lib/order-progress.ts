import { ORDER_PROGRESS, ORDER_STATUS_LABELS, OrderStatus, type OrderDto } from '@topflow/shared';

export type StepState = 'complete' | 'current' | 'upcoming' | 'cancelled';

export interface ProgressStep {
  key: string;
  label: string;
  state: StepState;
  date?: string;
  hint?: string;
}

export type ProgressOrder = Pick<OrderDto, 'status' | 'events' | 'createdAt' | 'cancelledAt' | 'cancellationReason'>;

const CURRENT_HINTS: Partial<Record<OrderStatus, string>> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Preparation starts shortly',
  PROCESSING: 'Being picked and packed',
  DISPATCHED: 'On its way to you',
};

/**
 * The steps of the customer's order tracker. Steps before the order's first status never applied
 * (pay-on-delivery orders start out confirmed); the furthest status reached is the current step,
 * except that a delivered order is complete; later steps are upcoming; a cancelled order shows only
 * how far it got, followed by the cancellation.
 */
export function buildSteps(order: ProgressOrder): ProgressStep[] {
  const reached = new Set<OrderStatus>([order.status]);
  for (const event of order.events) {
    reached.add(event.toStatus);
    if (event.fromStatus) reached.add(event.fromStatus);
  }
  const dateOf = (status: OrderStatus) => order.events.find((event) => event.toStatus === status)?.createdAt;
  const cancelled = order.status === OrderStatus.CANCELLED;
  const cancelledStep: ProgressStep = {
    key: OrderStatus.CANCELLED,
    label: ORDER_STATUS_LABELS.CANCELLED,
    state: 'cancelled',
    date: order.cancelledAt ?? dateOf(OrderStatus.CANCELLED),
  };

  const reachedIndexes = ORDER_PROGRESS.flatMap((status, index) => (reached.has(status) ? [index] : []));
  if (reachedIndexes.length === 0) return cancelled ? [cancelledStep] : [];

  const first = reachedIndexes[0];
  const last = reachedIndexes[reachedIndexes.length - 1];
  const delivered = order.status === OrderStatus.DELIVERED;

  const steps = ORDER_PROGRESS.slice(first, cancelled ? last + 1 : undefined).map((status, offset): ProgressStep => {
    const index = first + offset;
    const state: StepState = cancelled || index < last || (index === last && delivered) ? 'complete' : index === last ? 'current' : 'upcoming';
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
