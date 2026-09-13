import { Injectable } from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  DocumentType,
  OrderChannel,
  OrderStatus,
  PAYMENT_TERMS_LABELS,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
  quotationDisplayNumber,
  toFils,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/numbering.service';
import type { RequestMeta } from '../common/request-context';

export type QuotationForOrder = Prisma.QuotationGetPayload<{
  include: { items: true; quoteRequest: true; organization: true };
}>;

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
}

/**
 * Writes sales orders. Every creation and status change goes through here so the order
 * timeline (order_status_events) and the audit trail can never be skipped.
 */
@Injectable()
export class OrderWriter {
  constructor(
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  recordEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorId: string | null,
    note?: string | null,
  ): Promise<unknown> {
    return tx.orderStatusEvent.create({
      data: { orderId, fromStatus, toStatus, actorId, note: note ?? null },
    });
  }

  /**
   * Converts an accepted quotation into a B2B sales order, applying the organization's
   * commercial terms:
   *  • PREPAID accounts → PENDING_PAYMENT (proforma, bank transfer)
   *  • credit accounts  → CONFIRMED on credit, unless outstanding unpaid orders plus this
   *    order would exceed the credit limit, in which case the order waits for payment.
   */
  async createFromQuotation(
    tx: Prisma.TransactionClient,
    quotation: QuotationForOrder,
    acceptedById: string,
    meta: RequestMeta,
  ): Promise<CreatedOrder> {
    const org = quotation.organization;
    let status: OrderStatus = OrderStatus.PENDING_PAYMENT;
    let paymentMethod: PaymentMethod = PaymentMethod.BANK_TRANSFER;
    let releaseNote = 'Awaiting advance payment (prepaid account)';

    if (org && org.paymentTerms !== PaymentTerms.PREPAID) {
      const outstanding = await tx.order.aggregate({
        where: {
          organizationId: org.id,
          paymentStatus: PaymentStatus.UNPAID,
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { totalAmount: true },
      });
      const exposureFils =
        toFils(outstanding._sum.totalAmount ?? 0) + toFils(quotation.total);
      if (exposureFils <= toFils(org.creditLimit)) {
        status = OrderStatus.CONFIRMED;
        paymentMethod = PaymentMethod.CREDIT_ACCOUNT;
        releaseNote = `Released on ${PAYMENT_TERMS_LABELS[org.paymentTerms]} credit`;
      } else {
        releaseNote = 'Credit limit exceeded — awaiting payment before release';
      }
    }

    const orderNumber = await this.numbering.next(DocumentType.SALES_ORDER, tx);
    const rfq = quotation.quoteRequest;
    const order = await tx.order.create({
      data: {
        orderNumber,
        channel: OrderChannel.B2B,
        status,
        userId: acceptedById,
        organizationId: quotation.organizationId,
        quotationId: quotation.id,
        currency: quotation.currency,
        vatRateBps: quotation.vatRateBps,
        subtotal: quotation.subtotal,
        discountTotal: quotation.discountTotal,
        deliveryFee: quotation.deliveryFee,
        vatAmount: quotation.vatAmount,
        totalAmount: quotation.total,
        paymentMethod,
        purchaseOrderNumber: quotation.purchaseOrderNumber,
        projectReference: rfq?.projectReference ?? null,
        shippingAddress:
          rfq?.shippingAddress ?? 'Delivery site to be confirmed',
        deliveryAddress: rfq?.deliveryAddress ?? undefined,
        notes: quotation.notes,
        confirmedAt: status === OrderStatus.CONFIRMED ? new Date() : null,
        items: {
          create: quotation.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            uom: item.uom,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            quantity: item.quantity,
            totalPrice: item.lineSubtotal,
            vatAmount: item.vatAmount,
          })),
        },
      },
    });

    await this.recordEvent(
      tx,
      order.id,
      null,
      status,
      acceptedById,
      `Created from quotation ${quotationDisplayNumber(quotation.number, quotation.revision)}. ${releaseNote}.`,
    );
    await this.audit.record(
      {
        action: AuditAction.ORDER_PLACED,
        entityType: 'Order',
        entityId: order.id,
        organizationId: quotation.organizationId,
        userId: acceptedById,
        ipAddress: meta.ipAddress,
        details: {
          orderNumber,
          quotationId: quotation.id,
          status,
          total: quotation.total.toString(),
        },
      },
      tx,
    );
    return { id: order.id, orderNumber, status };
  }
}
