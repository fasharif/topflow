import {
  OrderStatus,
  PaymentStatus,
  PaymentTerms,
  calculateTotals,
  fromFils,
  retailDeliveryFeeFils,
  toFils,
  type OrderSummaryDto,
  type OrganizationDto,
  type Paginated,
} from '@topflow/shared';
import type { BffClient } from './bff';

/** A type alias rather than an interface, so it can be passed to toMatchObject. */
export type ExpectedTotals = {
  subtotal: string;
  deliveryFee: string;
  vatAmount: string;
  totalAmount: string;
};

/**
 * What a retail order must cost, from catalogue prices: the documented policy (delivery AED 25
 * below a net AED 500, VAT 5 % per line and on delivery) applied with the shared money maths.
 */
export function expectedRetailTotals(lines: Array<{ unitPrice: string; quantity: number }>): ExpectedTotals {
  const netFils = lines.reduce((sum, line) => sum + toFils(line.unitPrice) * line.quantity, 0);
  const totals = calculateTotals(
    lines.map((line) => ({ listPriceFils: toFils(line.unitPrice), quantity: line.quantity })),
    { deliveryFeeFils: retailDeliveryFeeFils(netFils) },
  );
  return {
    subtotal: fromFils(totals.subtotalFils),
    deliveryFee: fromFils(totals.deliveryFeeFils),
    vatAmount: fromFils(totals.vatFils),
    totalAmount: fromFils(totals.totalFils),
  };
}

export interface CreditPosition {
  paymentTerms: PaymentTerms;
  creditLimit: string;
  /** Unpaid, not cancelled orders: what counts against the credit limit. */
  exposure: string;
}

/** An organization's credit position as its own members can see it (company profile and orders). */
export async function creditPosition(api: BffClient, organizationId: string): Promise<CreditPosition> {
  const organization = await api.get<OrganizationDto>('/org', { organizationId });
  let exposureFils = 0;
  for (let page = 1; ; page++) {
    const orders = await api.get<Paginated<OrderSummaryDto>>('/org/orders', { organizationId, query: { page, pageSize: 100 } });
    for (const order of orders.items) {
      if (order.paymentStatus === PaymentStatus.UNPAID && order.status !== OrderStatus.CANCELLED) exposureFils += toFils(order.totalAmount);
    }
    if (page >= orders.totalPages) break;
  }
  return { paymentTerms: organization.paymentTerms, creditLimit: organization.creditLimit, exposure: fromFils(exposureFils) };
}

/**
 * Test oracle for the release rule in docs/testing/TEST-PLAN.md (decision table "credit terms"):
 * prepaid accounts wait for payment; credit accounts are released while the outstanding exposure
 * plus this order stays within the credit limit (the limit itself included).
 */
export function expectedRelease(position: CreditPosition, orderTotal: string): OrderStatus {
  if (position.paymentTerms === PaymentTerms.PREPAID) return OrderStatus.PENDING_PAYMENT;
  return toFils(position.exposure) + toFils(orderTotal) <= toFils(position.creditLimit) ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;
}
