import type { OrderItem, Prisma } from '@topflow/database';
import {
  fromFils,
  toFils,
  type AddressSnapshot,
  type DocumentLineDto,
  type OrderDto,
  type OrderStatus,
  type OrderSummaryDto,
} from '@topflow/shared';
import { isoOrNull, money } from '../common/serialization';

const userRef = { select: { id: true, fullName: true, email: true } } as const;

export const orderSummaryInclude = {
  user: userRef,
  organization: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

export const orderInclude = {
  ...orderSummaryInclude,
  items: true,
  quotation: { select: { id: true, number: true, revision: true } },
  events: {
    include: { actor: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.OrderInclude;

export type OrderSummaryRecord = Prisma.OrderGetPayload<{
  include: typeof orderSummaryInclude;
}>;
export type OrderRecord = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

function toOrderLine(item: OrderItem): DocumentLineDto {
  return {
    id: item.id,
    productId: item.productId,
    sku: item.sku,
    productName: item.productName,
    uom: item.uom,
    quantity: item.quantity,
    listPrice: null,
    discountRate: money(item.discountRate),
    unitPrice: money(item.unitPrice),
    lineSubtotal: money(item.totalPrice),
    vatAmount: money(item.vatAmount),
    lineTotal: fromFils(toFils(item.totalPrice) + toFils(item.vatAmount)),
  };
}

export function toOrderSummary(order: OrderSummaryRecord): OrderSummaryDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    channel: order.channel,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: money(order.totalAmount),
    itemCount: order._count.items,
    customer: order.user,
    organization: order.organization,
    createdAt: order.createdAt.toISOString(),
  };
}

export function toOrderDto(
  order: OrderRecord,
  access: { allowedTransitions: OrderStatus[]; canCancel: boolean },
): OrderDto {
  return {
    ...toOrderSummary(order),
    quotation: order.quotation,
    currency: order.currency,
    vatRateBps: order.vatRateBps,
    subtotal: money(order.subtotal),
    discountTotal: money(order.discountTotal),
    deliveryFee: money(order.deliveryFee),
    vatAmount: money(order.vatAmount),
    paymentMethod: order.paymentMethod,
    paymentReference: order.paymentReference,
    paidAt: isoOrNull(order.paidAt),
    purchaseOrderNumber: order.purchaseOrderNumber,
    projectReference: order.projectReference,
    shippingAddress: order.shippingAddress,
    deliveryAddress: (order.deliveryAddress as AddressSnapshot | null) ?? null,
    notes: order.notes,
    trackingReference: order.trackingReference,
    confirmedAt: isoOrNull(order.confirmedAt),
    dispatchedAt: isoOrNull(order.dispatchedAt),
    deliveredAt: isoOrNull(order.deliveredAt),
    cancelledAt: isoOrNull(order.cancelledAt),
    cancellationReason: order.cancellationReason,
    items: order.items.map(toOrderLine),
    events: order.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      actor: event.actor,
      createdAt: event.createdAt.toISOString(),
    })),
    allowedTransitions: access.allowedTransitions,
    canCancel: access.canCancel,
    updatedAt: order.updatedAt.toISOString(),
  };
}
