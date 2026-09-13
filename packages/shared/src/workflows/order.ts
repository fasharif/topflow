import { OrderStatus } from '../enums';
import { Permission } from '../permissions';
import type { TransitionMap } from './state-machine';

/**
 * Sales-order lifecycle (retail and B2B share it):
 *
 *   PENDING_PAYMENT ─► CONFIRMED ─► PROCESSING ─► DISPATCHED ─► DELIVERED
 *          │               │             │
 *          └───────────────┴─────────────┴──► CANCELLED
 *
 * Cancellation is impossible once goods have left the warehouse.
 */
export const ORDER_TRANSITIONS: TransitionMap<OrderStatus> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
  [OrderStatus.DISPATCHED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** Staff permission needed to move an order INTO each status. */
export const ORDER_STATUS_PERMISSION: Readonly<Record<OrderStatus, Permission | null>> = {
  [OrderStatus.PENDING_PAYMENT]: null,
  [OrderStatus.CONFIRMED]: Permission.ORDERS_MANAGE,
  [OrderStatus.PROCESSING]: Permission.ORDERS_FULFIL,
  [OrderStatus.DISPATCHED]: Permission.ORDERS_FULFIL,
  [OrderStatus.DELIVERED]: Permission.ORDERS_FULFIL,
  [OrderStatus.CANCELLED]: Permission.ORDERS_MANAGE,
};

/** The linear happy path, used by clients to draw progress trackers. */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

/** Customers may cancel their own order until the warehouse starts picking it. */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING_PAYMENT || status === OrderStatus.CONFIRMED;
}
