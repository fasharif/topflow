import { OrderStatus, type OrderEventDto } from '@topflow/shared';
import { buildSteps, type ProgressOrder, type StepState } from './order-progress';

/*
 * The customer's order tracker (BUG-12 in docs/testing/BUGS-FOUND.md): every step must say how far
 * the order really got. A newly confirmed order used to show "Delivered" as completed.
 */

let sequence = 0;
function event(fromStatus: OrderStatus | null, toStatus: OrderStatus): OrderEventDto {
  sequence += 1;
  return { id: `event-${sequence}`, fromStatus, toStatus, note: null, actor: null, createdAt: `2026-09-2${sequence % 10}T08:00:00.000Z` };
}

/** An order that went through `path` in order and now has the last status of it. */
function orderThrough(path: OrderStatus[]): ProgressOrder {
  const events = path.map((status, index) => event(index === 0 ? null : path[index - 1], status));
  const status = path[path.length - 1];
  return {
    status,
    events,
    createdAt: '2026-09-20T08:00:00.000Z',
    cancelledAt: status === OrderStatus.CANCELLED ? '2026-09-25T08:00:00.000Z' : null,
    cancellationReason: status === OrderStatus.CANCELLED ? 'Changed my mind' : null,
  };
}

const states = (order: ProgressOrder): Array<[string, StepState]> => buildSteps(order).map((step) => [step.key, step.state]);

const { PENDING_PAYMENT, CONFIRMED, PROCESSING, DISPATCHED, DELIVERED, CANCELLED } = OrderStatus;

describe('buildSteps', () => {
  it('shows a new pay-on-delivery order as confirmed, with every later step still to come', () => {
    expect(states(orderThrough([CONFIRMED]))).toEqual([
      [CONFIRMED, 'current'],
      [PROCESSING, 'upcoming'],
      [DISPATCHED, 'upcoming'],
      [DELIVERED, 'upcoming'],
    ]);
  });

  it.each([
    [[CONFIRMED, PROCESSING], PROCESSING],
    [[CONFIRMED, PROCESSING, DISPATCHED], DISPATCHED],
    [[PENDING_PAYMENT], PENDING_PAYMENT],
    [[PENDING_PAYMENT, CONFIRMED], CONFIRMED],
  ])('marks only the steps before %j complete and never Delivered before delivery', (path, current) => {
    const steps = buildSteps(orderThrough(path));
    const currentIndex = steps.findIndex((step) => step.key === current);
    steps.forEach((step, index) => {
      expect([step.key, step.state]).toEqual([step.key, index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming']);
    });
    expect(steps.find((step) => step.key === DELIVERED)?.state).toBe('upcoming');
  });

  it('shows a delivered order as complete, with no current step', () => {
    expect(states(orderThrough([CONFIRMED, PROCESSING, DISPATCHED, DELIVERED]))).toEqual([
      [CONFIRMED, 'complete'],
      [PROCESSING, 'complete'],
      [DISPATCHED, 'complete'],
      [DELIVERED, 'complete'],
    ]);
  });

  it('starts a prepaid order at the payment step', () => {
    expect(states(orderThrough([PENDING_PAYMENT, CONFIRMED, PROCESSING, DISPATCHED, DELIVERED]))[0]).toEqual([PENDING_PAYMENT, 'complete']);
  });

  it('shows how far a cancelled order got, then the cancellation', () => {
    expect(states(orderThrough([CONFIRMED, PROCESSING, CANCELLED]))).toEqual([
      [CONFIRMED, 'complete'],
      [PROCESSING, 'complete'],
      [CANCELLED, 'cancelled'],
    ]);
  });

  it('dates the steps that happened and gives the current step a hint', () => {
    const order = orderThrough([CONFIRMED, PROCESSING]);
    const [confirmed, processing, dispatched] = buildSteps(order);
    expect(confirmed.date).toBe(order.events[0].createdAt);
    expect(processing).toMatchObject({ state: 'current', date: order.events[1].createdAt, hint: 'Being picked and packed' });
    expect(dispatched).toMatchObject({ state: 'upcoming', date: undefined, hint: undefined });
  });
});
