import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  DocumentType,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_PERMISSION,
  ORDER_TRANSITIONS,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  StockStatus,
  VAT_RATE_BPS,
  assertTransition,
  bpsToPercent,
  calculateTotals,
  fromFils,
  hasPermission,
  isCustomerCancellable,
  nextStatuses,
  retailDeliveryFeeFils,
  toFils,
  type CancelOrderInput,
  type CheckoutInput,
  type OrderDto,
  type OrderQuery,
  type OrderSummaryDto,
  type Paginated,
  type RecordPaymentInput,
  type RecordRefundInput,
  type UpdateOrderStatusInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/numbering.service';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { money, pageArgs, paginated } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { MailService } from '../mail/mail.service';
import { orderStatusEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddressBookService,
  addressSnapshot,
  formatAddress,
} from '../users/address-book.service';
import { OrderWriter } from './order-writer.service';
import {
  orderInclude,
  orderSummaryInclude,
  toOrderDto,
  toOrderSummary,
  type OrderRecord,
} from './order.mapper';

type Viewer =
  | { kind: 'customer' }
  | { kind: 'organization'; ctx: OrganizationContext }
  | { kind: 'staff'; user: AuthenticatedUser };

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly writer: OrderWriter,
    private readonly addressBook: AddressBookService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  // ─── Retail checkout ────────────────────────────────────────────────────

  /**
   * Places a retail order. Every price, discount, delivery fee and VAT amount is computed
   * here from the catalog — the client only says what and how many.
   */
  async checkout(
    user: AuthenticatedUser,
    input: CheckoutInput,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    if (input.paymentMethod === PaymentMethod.CARD) {
      throw new UnprocessableEntityException(
        'Online card payments are coming soon — please choose payment on delivery',
      );
    }

    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: [...quantities.keys()] } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const [productId, quantity] of quantities) {
      const product = byId.get(productId);
      if (!product || !product.isActive || product.isTradeOnly) {
        throw new UnprocessableEntityException(
          `${product?.sku ?? 'A product'} is not available for online purchase`,
        );
      }
      if (quantity < product.minOrderQty) {
        throw new UnprocessableEntityException(
          `The minimum order quantity for ${product.sku} is ${product.minOrderQty}`,
        );
      }
      if (product.stockQuantity < quantity) {
        throw new ConflictException(
          `Only ${product.stockQuantity} × ${product.sku} available right now`,
        );
      }
    }

    const address = input.addressId
      ? await this.addressBook.get({ userId: user.id }, input.addressId)
      : null;
    const snapshot = address
      ? addressSnapshot(address)
      : addressSnapshot(input.address!);
    if (!address && input.saveAddress && input.address) {
      await this.addressBook.create({ userId: user.id }, input.address);
    }

    const lines = [...quantities].map(([productId, quantity]) => ({
      product: byId.get(productId)!,
      quantity,
    }));
    const netSubtotalFils = lines.reduce(
      (sum, l) => sum + toFils(l.product.unitPrice) * l.quantity,
      0,
    );
    const totals = calculateTotals(
      lines.map((l) => ({
        listPriceFils: toFils(l.product.unitPrice),
        quantity: l.quantity,
      })),
      {
        deliveryFeeFils: retailDeliveryFeeFils(netSubtotalFils),
        vatRateBps: VAT_RATE_BPS,
      },
    );

    const now = new Date();
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.numbering.next(
        DocumentType.SALES_ORDER,
        tx,
      );
      const created = await tx.order.create({
        data: {
          orderNumber,
          channel: OrderChannel.RETAIL,
          status: OrderStatus.CONFIRMED,
          userId: user.id,
          vatRateBps: VAT_RATE_BPS,
          subtotal: fromFils(totals.subtotalFils),
          discountTotal: fromFils(totals.discountTotalFils),
          deliveryFee: fromFils(totals.deliveryFeeFils),
          vatAmount: fromFils(totals.vatFils),
          totalAmount: fromFils(totals.totalFils),
          paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
          paymentStatus: PaymentStatus.UNPAID,
          shippingAddress: formatAddress(snapshot),
          deliveryAddress: snapshot,
          notes: input.notes,
          confirmedAt: now,
          items: {
            create: lines.map((line, index) => {
              const amounts = totals.lines[index];
              return {
                productId: line.product.id,
                productName: line.product.name,
                sku: line.product.sku,
                uom: line.product.uom,
                unitPrice: fromFils(amounts.unitPriceFils),
                discountRate: bpsToPercent(amounts.discountBps),
                quantity: amounts.quantity,
                totalPrice: fromFils(amounts.lineSubtotalFils),
                vatAmount: fromFils(amounts.vatFils),
              };
            }),
          },
        },
        include: orderInclude,
      });
      await this.writer.recordEvent(
        tx,
        created.id,
        null,
        OrderStatus.CONFIRMED,
        user.id,
        'Order placed online — payment on delivery',
      );
      await this.audit.record(
        {
          action: AuditAction.ORDER_PLACED,
          entityType: 'Order',
          entityId: created.id,
          userId: user.id,
          ipAddress: meta.ipAddress,
          details: {
            orderNumber,
            total: created.totalAmount.toString(),
            channel: OrderChannel.RETAIL,
          },
        },
        tx,
      );
      return created;
    });

    this.notifyCustomer(order, 'Confirmed');
    return this.reload(order.id, { kind: 'customer' });
  }

  // ─── Customer & organization views ──────────────────────────────────────

  listMine(
    user: AuthenticatedUser,
    query: OrderQuery,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.list(
      { ...this.filters(query), userId: user.id, organizationId: null },
      query,
    );
  }

  async getMine(user: AuthenticatedUser, id: string): Promise<OrderDto> {
    return this.view(
      await this.findOne({ id, userId: user.id, organizationId: null }),
      { kind: 'customer' },
    );
  }

  async cancelMine(
    user: AuthenticatedUser,
    id: string,
    input: CancelOrderInput,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    const order = await this.findOne({
      id,
      userId: user.id,
      organizationId: null,
    });
    return this.cancel(order, input.reason, user.id, meta, {
      kind: 'customer',
    });
  }

  listForOrganization(
    ctx: OrganizationContext,
    query: OrderQuery,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.list(
      { ...this.filters(query), organizationId: ctx.organizationId },
      query,
    );
  }

  async getForOrganization(
    ctx: OrganizationContext,
    id: string,
  ): Promise<OrderDto> {
    return this.view(
      await this.findOne({ id, organizationId: ctx.organizationId }),
      { kind: 'organization', ctx },
    );
  }

  async cancelForOrganization(
    ctx: OrganizationContext,
    id: string,
    input: CancelOrderInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    const order = await this.findOne({
      id,
      organizationId: ctx.organizationId,
    });
    return this.cancel(order, input.reason, actor.id, meta, {
      kind: 'organization',
      ctx,
    });
  }

  // ─── Back office ────────────────────────────────────────────────────────

  adminList(query: OrderQuery): Promise<Paginated<OrderSummaryDto>> {
    return this.list(
      {
        ...this.filters(query),
        ...(query.channel && { channel: query.channel }),
        ...(query.organizationId && { organizationId: query.organizationId }),
      },
      query,
    );
  }

  async adminGet(user: AuthenticatedUser, id: string): Promise<OrderDto> {
    return this.view(await this.findOne({ id }), { kind: 'staff', user });
  }

  /**
   * Moves an order through fulfilment. Each target status requires its own permission
   * (sales confirm and cancel, the warehouse picks, dispatches and delivers).
   */
  async transition(
    user: AuthenticatedUser,
    id: string,
    input: UpdateOrderStatusInput,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    const order = await this.findOne({ id });
    assertTransition(ORDER_TRANSITIONS, order.status, input.status, 'order');
    const required = ORDER_STATUS_PERMISSION[input.status];
    if (required && !hasPermission(user.role, required)) {
      throw new ForbiddenException(
        `Your role cannot move orders to ${ORDER_STATUS_LABELS[input.status]}`,
      );
    }
    if (input.status === OrderStatus.CANCELLED) {
      return this.cancel(
        order,
        input.note ?? 'Cancelled by Top Flow',
        user.id,
        meta,
        { kind: 'staff', user },
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.OrderUpdateInput = { status: input.status };
      let note = input.note ?? null;

      if (input.status === OrderStatus.CONFIRMED) data.confirmedAt = now;
      if (input.status === OrderStatus.DISPATCHED) {
        await this.commitStock(tx, order);
        data.dispatchedAt = now;
        data.trackingReference =
          input.trackingReference ?? order.trackingReference;
      }
      if (input.status === OrderStatus.DELIVERED) {
        data.deliveredAt = now;
        if (
          order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
          order.paymentStatus === PaymentStatus.UNPAID
        ) {
          Object.assign(data, {
            paymentStatus: PaymentStatus.PAID,
            paidAt: now,
          });
          note = [note, 'Payment collected on delivery']
            .filter(Boolean)
            .join(' · ');
        }
      }

      await tx.order.update({ where: { id }, data });
      await this.writer.recordEvent(
        tx,
        id,
        order.status,
        input.status,
        user.id,
        note,
      );
      await this.audit.record(
        {
          action: AuditAction.ORDER_STATUS_CHANGED,
          entityType: 'Order',
          entityId: id,
          organizationId: order.organizationId,
          userId: user.id,
          ipAddress: meta.ipAddress,
          details: { from: order.status, to: input.status },
        },
        tx,
      );
    });

    this.notifyCustomer(
      order,
      ORDER_STATUS_LABELS[input.status],
      input.trackingReference
        ? `Tracking reference: ${input.trackingReference}`
        : input.note,
    );
    return this.adminGet(user, id);
  }

  /** Records a received payment; prepaid orders waiting for payment are released automatically. */
  async recordPayment(
    user: AuthenticatedUser,
    id: string,
    input: RecordPaymentInput,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    const order = await this.findOne({ id });
    if (order.paymentStatus === PaymentStatus.PAID)
      throw new ConflictException(
        'Payment has already been recorded for this order',
      );
    if (order.status === OrderStatus.CANCELLED)
      throw new ConflictException('Cannot record payment on a cancelled order');

    const release = order.status === OrderStatus.PENDING_PAYMENT;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paidAt: now,
          paymentReference: input.paymentReference ?? order.paymentReference,
          ...(release && { status: OrderStatus.CONFIRMED, confirmedAt: now }),
        },
      });
      if (release) {
        await this.writer.recordEvent(
          tx,
          id,
          order.status,
          OrderStatus.CONFIRMED,
          user.id,
          `Payment received${input.paymentReference ? ` (${input.paymentReference})` : ''}`,
        );
      }
      await this.audit.record(
        {
          action: AuditAction.ORDER_PAYMENT_RECORDED,
          entityType: 'Order',
          entityId: id,
          organizationId: order.organizationId,
          userId: user.id,
          ipAddress: meta.ipAddress,
          details: {
            reference: input.paymentReference ?? null,
            released: release,
          },
        },
        tx,
      );
    });
    if (release)
      this.notifyCustomer(order, 'Confirmed', 'We have received your payment.');
    return this.adminGet(user, id);
  }

  /**
   * Records the refund of a cancelled order that had already been paid — the only way the payment
   * status becomes Refunded. The refund itself is made in the bank; this closes the order's money
   * trail, tells the customer, and leaves the reference in the timeline and the audit log.
   */
  async recordRefund(
    user: AuthenticatedUser,
    id: string,
    input: RecordRefundInput,
    meta: RequestMeta,
  ): Promise<OrderDto> {
    const order = await this.findOne({ id });
    if (order.paymentStatus === PaymentStatus.REFUNDED)
      throw new ConflictException(
        'A refund has already been recorded for this order',
      );
    if (order.paymentStatus !== PaymentStatus.PAID)
      throw new ConflictException(
        'This order has no recorded payment, so there is nothing to refund',
      );
    if (order.status !== OrderStatus.CANCELLED)
      throw new ConflictException(
        'Cancel the order first: refunds are recorded against cancelled orders',
      );

    const amount = money(order.totalAmount);
    const reference = input.refundReference?.trim() || null;
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
      await this.writer.recordEvent(
        tx,
        id,
        OrderStatus.CANCELLED,
        OrderStatus.CANCELLED,
        user.id,
        `Refund of AED ${amount} recorded${reference ? ` (${reference})` : ''}${input.note ? `. ${input.note}` : ''}`,
      );
      await this.audit.record(
        {
          action: AuditAction.ORDER_REFUND_RECORDED,
          entityType: 'Order',
          entityId: id,
          organizationId: order.organizationId,
          userId: user.id,
          ipAddress: meta.ipAddress,
          details: { amount, reference, note: input.note ?? null },
        },
        tx,
      );
    });
    this.notifyCustomer(
      order,
      'Refunded',
      `We have refunded AED ${amount}${reference ? ` (reference ${reference})` : ''}. Please allow a few working days for it to reach your account.${input.note ? `\n\n${input.note}` : ''}`,
    );
    return this.adminGet(user, id);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Deducts stock when goods leave the warehouse. The conditional update makes it impossible
   * to dispatch more than is physically available, even under concurrent dispatches.
   */
  private async commitStock(
    tx: Prisma.TransactionClient,
    order: OrderRecord,
  ): Promise<void> {
    for (const item of order.items) {
      if (!item.productId) continue;
      const { count } = await tx.product.updateMany({
        where: { id: item.productId, stockQuantity: { gte: item.quantity } },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      if (count !== 1) {
        throw new ConflictException(
          `Insufficient stock to dispatch ${item.quantity} × ${item.sku}. Adjust stock or split the order.`,
        );
      }
      await tx.product.updateMany({
        where: { id: item.productId, stockQuantity: 0 },
        data: { stockStatus: StockStatus.ON_ORDER },
      });
    }
  }

  private async cancel(
    order: OrderRecord,
    reason: string,
    actorId: string,
    meta: RequestMeta,
    viewer: Viewer,
  ): Promise<OrderDto> {
    const allowed =
      viewer.kind === 'staff'
        ? nextStatuses(ORDER_TRANSITIONS, order.status).includes(
            OrderStatus.CANCELLED,
          )
        : isCustomerCancellable(order.status, order.paymentStatus) &&
          (viewer.kind === 'customer' || hasOrgApprovalRights(viewer.ctx));
    if (!allowed) {
      // Money already received: Top Flow cancels the order, so the refund is arranged with it.
      const paidButOtherwiseCancellable =
        viewer.kind !== 'staff' &&
        order.paymentStatus === PaymentStatus.PAID &&
        isCustomerCancellable(order.status, PaymentStatus.UNPAID);
      throw new ConflictException(
        paidButOtherwiseCancellable
          ? 'This order has already been paid. Contact Top Flow to cancel it and arrange the refund.'
          : `A ${ORDER_STATUS_LABELS[order.status].toLowerCase()} order can no longer be cancelled`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });
      await this.writer.recordEvent(
        tx,
        order.id,
        order.status,
        OrderStatus.CANCELLED,
        actorId,
        reason,
      );
      await this.audit.record(
        {
          action: AuditAction.ORDER_CANCELLED,
          entityType: 'Order',
          entityId: order.id,
          organizationId: order.organizationId,
          userId: actorId,
          ipAddress: meta.ipAddress,
          details: { from: order.status, reason },
        },
        tx,
      );
    });
    this.notifyCustomer(
      order,
      'Cancelled',
      order.paymentStatus === PaymentStatus.PAID
        ? `${reason}\n\nYou have paid AED ${money(order.totalAmount)} for this order. We will refund it and confirm once it has been sent.`
        : reason,
    );
    return this.reload(order.id, viewer);
  }

  private view(order: OrderRecord, viewer: Viewer): OrderDto {
    if (viewer.kind === 'staff') {
      const allowedTransitions = nextStatuses(
        ORDER_TRANSITIONS,
        order.status,
      ).filter((status) => {
        const permission = ORDER_STATUS_PERMISSION[status];
        return !permission || hasPermission(viewer.user.role, permission);
      });
      return toOrderDto(order, {
        allowedTransitions,
        canCancel: allowedTransitions.includes(OrderStatus.CANCELLED),
      });
    }
    const canCancel =
      isCustomerCancellable(order.status, order.paymentStatus) &&
      (viewer.kind === 'customer' || hasOrgApprovalRights(viewer.ctx));
    return toOrderDto(order, { allowedTransitions: [], canCancel });
  }

  private async reload(id: string, viewer: Viewer): Promise<OrderDto> {
    return this.view(await this.findOne({ id }), viewer);
  }

  private async findOne(where: Prisma.OrderWhereInput): Promise<OrderRecord> {
    const order = await this.prisma.order.findFirst({
      where,
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private filters(query: OrderQuery): Prisma.OrderWhereInput {
    return {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { orderNumber: { contains: query.search, mode: 'insensitive' } },
          {
            purchaseOrderNumber: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          { projectReference: { contains: query.search, mode: 'insensitive' } },
          {
            user: { fullName: { contains: query.search, mode: 'insensitive' } },
          },
          {
            organization: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
  }

  private async list(
    where: Prisma.OrderWhereInput,
    query: OrderQuery,
  ): Promise<Paginated<OrderSummaryDto>> {
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderSummaryInclude,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(orders.map(toOrderSummary), total, query);
  }

  private notifyCustomer(
    order: {
      id: string;
      orderNumber: string;
      organizationId: string | null;
      user: { email: string; fullName: string } | null;
    },
    statusLabel: string,
    note?: string | null,
  ): void {
    if (!order.user) return;
    const path = order.organizationId
      ? `/business/orders/${order.id}`
      : `/account/orders/${order.id}`;
    this.mail
      .send({
        to: order.user.email,
        ...orderStatusEmail(
          order.user.fullName,
          order.orderNumber,
          statusLabel,
          `${this.config.app.publicUrl}${path}`,
          note,
        ),
      })
      .catch((error: unknown) =>
        this.logger.error(
          `Order email failed for ${order.orderNumber}`,
          error instanceof Error ? error.stack : error,
        ),
      );
  }
}

/** Within an organization, cancelling a committed purchase is reserved for approvers and owners. */
function hasOrgApprovalRights(ctx: OrganizationContext): boolean {
  return ctx.role === 'OWNER' || ctx.role === 'APPROVER';
}
