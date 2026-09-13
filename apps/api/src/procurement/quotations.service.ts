import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  ApprovalDecision,
  DocumentType,
  OrgRole,
  OrgStatus,
  QUOTATION_STATUS_LABELS,
  QUOTATION_TRANSITIONS,
  QuotationResponse,
  QuotationStatus,
  RFQ_TRANSITIONS,
  RfqStatus,
  VAT_RATE_BPS,
  assertTransition,
  bpsToPercent,
  calculateTotals,
  canTransition,
  formatMoney,
  fromFils,
  isQuotationExpired,
  percentToBps,
  quotationDisplayNumber,
  requiresApproval,
  toFils,
  type ApprovalDecisionInput,
  type CreateQuotationInput,
  type Paginated,
  type QuotationDto,
  type QuotationLineInput,
  type QuotationQuery,
  type QuotationSummaryDto,
  type RespondQuotationInput,
  type UpdateQuotationInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { DAY_MS, addDays } from '../common/dates';
import { NumberingService } from '../common/numbering.service';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { money, pageArgs, paginated } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { QuotationPdfService } from '../documents/quotation-pdf.service';
import { MailService } from '../mail/mail.service';
import { approvalRequestEmail, quotationSentEmail } from '../mail/templates';
import { OrderWriter } from '../orders/order-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  quotationInclude,
  quotationSummaryInclude,
  toQuotationDto,
  toQuotationSummary,
  type QuotationRecord,
} from './procurement.mapper';

const forOrderInclude = {
  items: { orderBy: { sortOrder: 'asc' } },
  quoteRequest: true,
  organization: true,
} satisfies Prisma.QuotationInclude;

const OPEN_FOR_SUPERSEDE: QuotationStatus[] = [
  QuotationStatus.SENT,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.REVISION_REQUESTED,
];
const REVISABLE: readonly QuotationStatus[] = [
  ...OPEN_FOR_SUPERSEDE,
  QuotationStatus.EXPIRED,
];

type Tx = Prisma.TransactionClient;

/**
 * The commercial heart of the B2B flow:
 *   RFQ → draft quotation → sent → (revision loop) → accepted → sales order
 * with segregation of duties: a buyer above their spending limit needs an approver,
 * and nobody can approve their own purchase.
 */
@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly orders: OrderWriter,
    private readonly pdf: QuotationPdfService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  // ─── Staff: authoring ───────────────────────────────────────────────────

  async create(
    input: CreateQuotationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const quotation = await this.prisma.$transaction(async (tx) => {
      let organizationId = input.organizationId ?? null;
      let customerId = input.customerId ?? null;
      let rfq: Prisma.QuoteRequestGetPayload<{
        include: { quotations: { select: { id: true } } };
      }> | null = null;

      if (input.quoteRequestId) {
        rfq = await tx.quoteRequest.findUnique({
          where: { id: input.quoteRequestId },
          include: { quotations: { select: { id: true } } },
        });
        if (!rfq) throw new NotFoundException('RFQ not found');
        if (
          rfq.status === RfqStatus.CLOSED ||
          rfq.status === RfqStatus.CANCELLED
        ) {
          throw new ConflictException(
            `RFQ ${rfq.number} is ${rfq.status.toLowerCase()} and cannot be quoted`,
          );
        }
        if (rfq.quotations.length > 0) {
          throw new ConflictException(
            'This RFQ already has a quotation — edit the draft or issue a revision instead',
          );
        }
        organizationId = rfq.organizationId;
        customerId = input.customerId ?? rfq.requestedById;
      }
      if (!customerId)
        throw new BadRequestException('A customer contact is required');
      if (
        !(await tx.user.findUnique({
          where: { id: customerId },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('Customer not found');
      }

      const organization = organizationId
        ? await tx.organization.findUnique({ where: { id: organizationId } })
        : null;
      if (organizationId && !organization)
        throw new NotFoundException('Organization not found');
      if (organizationId) {
        const member = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId, userId: customerId },
          },
        });
        if (!member)
          throw new BadRequestException(
            'The customer contact is not a member of this organization',
          );
      }

      const defaultDiscount =
        organization?.status === OrgStatus.ACTIVE
          ? money(organization.discountRate)
          : null;
      const built = await this.buildLines(
        tx,
        input.items,
        defaultDiscount,
        input.deliveryFee,
      );
      const number = await this.numbering.next(DocumentType.QUOTATION, tx);

      const created = await tx.quotation.create({
        data: {
          number,
          revision: 1,
          quoteRequestId: rfq?.id ?? null,
          organizationId,
          customerId,
          createdById: actor.id,
          status: QuotationStatus.DRAFT,
          ...built.totals,
          validUntil: addDays(new Date(), input.validityDays),
          terms: input.terms,
          notes: input.notes,
          internalNotes: input.internalNotes,
          items: { create: built.items },
        },
        include: quotationInclude,
      });

      if (
        rfq &&
        canTransition(RFQ_TRANSITIONS, rfq.status, RfqStatus.IN_REVIEW)
      ) {
        await tx.quoteRequest.update({
          where: { id: rfq.id },
          data: {
            status: RfqStatus.IN_REVIEW,
            assignedToId: rfq.assignedToId ?? actor.id,
          },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.QUOTATION_CREATED,
          entityType: 'Quotation',
          entityId: created.id,
          organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { number, total: built.totals.total },
        },
        tx,
      );
      return created;
    });
    return toQuotationDto(quotation, { includeInternal: true });
  }

  async update(
    id: string,
    input: UpdateQuotationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const current = await this.findOrThrow(id);
    if (current.status !== QuotationStatus.DRAFT) {
      throw new ConflictException(
        'Only draft quotations can be edited — issue a revision instead',
      );
    }
    const quotation = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.QuotationUpdateInput = {
        terms: input.terms,
        notes: input.notes,
        internalNotes: input.internalNotes,
      };
      // While drafting, validity is measured from creation; `send` re-anchors it to the send date.
      if (input.validityDays)
        data.validUntil = addDays(current.createdAt, input.validityDays);
      if (input.items || input.deliveryFee !== undefined) {
        const built = await this.buildLines(
          tx,
          input.items ?? this.linesFrom(current),
          await this.defaultDiscount(tx, current.organizationId),
          input.deliveryFee ?? money(current.deliveryFee),
        );
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        Object.assign(data, built.totals, { items: { create: built.items } });
      }
      const updated = await tx.quotation.update({
        where: { id },
        data,
        include: quotationInclude,
      });
      await this.audit.record(
        {
          action: AuditAction.QUOTATION_UPDATED,
          entityType: 'Quotation',
          entityId: id,
          organizationId: current.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { fields: Object.keys(input) },
        },
        tx,
      );
      return updated;
    });
    return toQuotationDto(quotation, { includeInternal: true });
  }

  async discard(
    id: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    const current = await this.findOrThrow(id);
    if (current.status !== QuotationStatus.DRAFT) {
      throw new ConflictException('Only draft quotations can be discarded');
    }
    await this.prisma.quotation.delete({ where: { id } });
    await this.audit.record({
      action: AuditAction.QUOTATION_UPDATED,
      entityType: 'Quotation',
      entityId: id,
      organizationId: current.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { discarded: true },
    });
  }

  /** Issues the quotation to the customer; earlier open revisions are superseded. */
  async send(
    id: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const current = await this.findOrThrow(id);
    assertTransition(
      QUOTATION_TRANSITIONS,
      current.status,
      QuotationStatus.SENT,
      'quotation',
    );
    if (!current.customer)
      throw new ConflictException('This quotation has no customer contact');

    // Whole days, so millisecond skew between drafting and the database timestamp never trims a day.
    const validityMs =
      Math.max(
        1,
        Math.round(
          (current.validUntil.getTime() - current.createdAt.getTime()) / DAY_MS,
        ),
      ) * DAY_MS;
    const now = new Date();
    const sent = await this.prisma.$transaction(async (tx) => {
      const earlier = await tx.quotation.findMany({
        where: {
          number: current.number,
          revision: { lt: current.revision },
          status: { in: OPEN_FOR_SUPERSEDE },
        },
        select: { id: true },
      });
      if (earlier.length > 0) {
        await tx.quotation.updateMany({
          where: { id: { in: earlier.map((q) => q.id) } },
          data: { status: QuotationStatus.SUPERSEDED },
        });
      }
      const updated = await tx.quotation.update({
        where: { id },
        // Validity runs from the day the customer receives the offer.
        data: {
          status: QuotationStatus.SENT,
          sentAt: now,
          validUntil: new Date(now.getTime() + validityMs),
        },
        include: quotationInclude,
      });
      if (current.quoteRequestId) {
        const rfq = await tx.quoteRequest.findUnique({
          where: { id: current.quoteRequestId },
        });
        if (
          rfq &&
          rfq.status !== RfqStatus.QUOTED &&
          canTransition(RFQ_TRANSITIONS, rfq.status, RfqStatus.QUOTED)
        ) {
          await tx.quoteRequest.update({
            where: { id: rfq.id },
            data: { status: RfqStatus.QUOTED },
          });
        }
      }
      await this.audit.record(
        {
          action: AuditAction.QUOTATION_SENT,
          entityType: 'Quotation',
          entityId: id,
          organizationId: current.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { superseded: earlier.length },
        },
        tx,
      );
      return updated;
    });

    const dto = toQuotationDto(sent, { includeInternal: true });
    this.sendMail(
      sent.customer!.email,
      quotationSentEmail(
        sent.customer!.fullName,
        dto.displayNumber,
        formatMoney(dto.total),
        new Date(dto.validUntil).toDateString(),
        `${this.config.app.publicUrl}/business/quotations/${id}`,
      ),
    );
    return dto;
  }

  /** Starts revision n+1 as a draft, copying the lines unless new ones are supplied. */
  async revise(
    id: string,
    input: UpdateQuotationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const current = await this.findOrThrow(id);
    if (!REVISABLE.includes(current.status)) {
      throw new ConflictException(
        `A ${QUOTATION_STATUS_LABELS[current.status].toLowerCase()} quotation cannot be revised`,
      );
    }
    const revision = await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.quotation.findMany({
        where: { number: current.number },
        select: { revision: true, status: true },
      });
      if (siblings.some((s) => s.status === QuotationStatus.DRAFT)) {
        throw new ConflictException(
          'A draft revision already exists for this quotation',
        );
      }
      const built = await this.buildLines(
        tx,
        input.items ?? this.linesFrom(current),
        await this.defaultDiscount(tx, current.organizationId),
        input.deliveryFee ?? money(current.deliveryFee),
      );
      const validityDays =
        input.validityDays ??
        Math.max(
          1,
          Math.round(
            (current.validUntil.getTime() -
              (current.sentAt ?? current.createdAt).getTime()) /
              DAY_MS,
          ),
        );
      const created = await tx.quotation.create({
        data: {
          number: current.number,
          revision: Math.max(...siblings.map((s) => s.revision)) + 1,
          quoteRequestId: current.quoteRequestId,
          organizationId: current.organizationId,
          customerId: current.customerId,
          createdById: actor.id,
          status: QuotationStatus.DRAFT,
          ...built.totals,
          validUntil: addDays(new Date(), validityDays),
          terms: input.terms ?? current.terms,
          notes: input.notes ?? current.notes,
          internalNotes: input.internalNotes ?? current.internalNotes,
          items: { create: built.items },
        },
        include: quotationInclude,
      });
      await this.audit.record(
        {
          action: AuditAction.QUOTATION_REVISED,
          entityType: 'Quotation',
          entityId: created.id,
          organizationId: current.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { from: id, revision: created.revision },
        },
        tx,
      );
      return created;
    });
    return toQuotationDto(revision, { includeInternal: true });
  }

  async adminList(
    query: QuotationQuery,
  ): Promise<Paginated<QuotationSummaryDto>> {
    return this.list(
      {
        ...this.filters(query),
        ...(query.status && { status: query.status }),
        ...(query.organizationId && { organizationId: query.organizationId }),
      },
      query,
    );
  }

  async adminGet(id: string): Promise<QuotationDto> {
    return toQuotationDto(await this.findOrThrow(id), {
      includeInternal: true,
    });
  }

  // ─── Customer (organization) side ───────────────────────────────────────

  async orgList(
    ctx: OrganizationContext,
    query: QuotationQuery,
  ): Promise<Paginated<QuotationSummaryDto>> {
    return this.list(
      {
        ...this.filters(query),
        organizationId: ctx.organizationId,
        status:
          query.status && query.status !== QuotationStatus.DRAFT
            ? query.status
            : { not: QuotationStatus.DRAFT },
      },
      query,
    );
  }

  async orgGet(ctx: OrganizationContext, id: string): Promise<QuotationDto> {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: { not: QuotationStatus.DRAFT },
      },
      include: quotationInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return toQuotationDto(quotation, { includeInternal: false });
  }

  async respond(
    ctx: OrganizationContext,
    id: string,
    input: RespondQuotationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const quotation = await this.openQuotationForOrg(
      ctx,
      id,
      QuotationStatus.SENT,
    );
    const now = new Date();

    if (input.action === QuotationResponse.ACCEPT) {
      if (ctx.organizationStatus !== OrgStatus.ACTIVE) {
        throw new ForbiddenException(
          'Your business account must be verified by Top Flow before you can accept quotations',
        );
      }
      const netFils =
        toFils(quotation.subtotal) + toFils(quotation.deliveryFee);
      const needsApproval = requiresApproval(
        {
          orgRole: ctx.role,
          approvalLimitFils:
            ctx.approvalLimit === null ? null : toFils(ctx.approvalLimit),
        },
        netFils,
      );
      const response = {
        respondedAt: now,
        respondedById: actor.id,
        purchaseOrderNumber:
          input.purchaseOrderNumber ?? quotation.purchaseOrderNumber,
        responseNote: input.note ?? null,
      };

      if (needsApproval) {
        await this.prisma.$transaction(async (tx) => {
          await tx.quotation.update({
            where: { id },
            data: { status: QuotationStatus.PENDING_APPROVAL, ...response },
          });
          await this.recordResponse(tx, ctx, id, actor, meta, {
            action: input.action,
            pendingApproval: true,
          });
        });
        await this.notifyApprovers(ctx, quotation, actor, netFils);
      } else {
        await this.prisma.$transaction(async (tx) => {
          const accepted = await tx.quotation.update({
            where: { id },
            data: {
              status: QuotationStatus.ACCEPTED,
              ...response,
              approvedById: actor.id,
              approvedAt: now,
            },
            include: forOrderInclude,
          });
          await this.orders.createFromQuotation(tx, accepted, actor.id, meta);
          await this.closeRfq(tx, accepted.quoteRequestId);
          await this.recordResponse(tx, ctx, id, actor, meta, {
            action: input.action,
          });
        });
      }
    } else if (input.action === QuotationResponse.REJECT) {
      await this.prisma.$transaction(async (tx) => {
        await tx.quotation.update({
          where: { id },
          data: {
            status: QuotationStatus.REJECTED,
            respondedAt: now,
            respondedById: actor.id,
            responseNote: input.note,
          },
        });
        await this.closeRfq(tx, quotation.quoteRequestId);
        await this.recordResponse(tx, ctx, id, actor, meta, {
          action: input.action,
        });
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.quotation.update({
          where: { id },
          data: {
            status: QuotationStatus.REVISION_REQUESTED,
            respondedAt: now,
            respondedById: actor.id,
            responseNote: input.note,
          },
        });
        if (quotation.quoteRequestId) {
          const rfq = await tx.quoteRequest.findUnique({
            where: { id: quotation.quoteRequestId },
          });
          if (
            rfq &&
            canTransition(RFQ_TRANSITIONS, rfq.status, RfqStatus.IN_REVIEW)
          ) {
            await tx.quoteRequest.update({
              where: { id: rfq.id },
              data: { status: RfqStatus.IN_REVIEW },
            });
          }
        }
        await this.recordResponse(tx, ctx, id, actor, meta, {
          action: input.action,
        });
      });
      this.sendMail(this.config.company.email, {
        subject: `Revision requested: ${quotationDisplayNumber(quotation.number, quotation.revision)} (${ctx.organizationName})`,
        text: `${actor.fullName} asked for changes:\n\n${input.note}\n\n${this.config.app.publicUrl}/admin/quotations/${id}`,
      });
    }
    return this.orgGet(ctx, id);
  }

  async decideApproval(
    ctx: OrganizationContext,
    id: string,
    input: ApprovalDecisionInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<QuotationDto> {
    const quotation = await this.openQuotationForOrg(
      ctx,
      id,
      QuotationStatus.PENDING_APPROVAL,
    );
    if (quotation.respondedById === actor.id) {
      throw new ForbiddenException(
        'You cannot approve your own purchase request',
      );
    }
    const netFils = toFils(quotation.subtotal) + toFils(quotation.deliveryFee);
    if (
      requiresApproval(
        {
          orgRole: ctx.role,
          approvalLimitFils:
            ctx.approvalLimit === null ? null : toFils(ctx.approvalLimit),
        },
        netFils,
      )
    ) {
      throw new ForbiddenException('This purchase exceeds your approval limit');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.decision === ApprovalDecision.APPROVE) {
        const accepted = await tx.quotation.update({
          where: { id },
          data: {
            status: QuotationStatus.ACCEPTED,
            approvedById: actor.id,
            approvedAt: new Date(),
          },
          include: forOrderInclude,
        });
        await this.orders.createFromQuotation(
          tx,
          accepted,
          quotation.respondedById ?? actor.id,
          meta,
        );
        await this.closeRfq(tx, accepted.quoteRequestId);
      } else {
        // Declined internally: the offer stays open so the buyer can negotiate or reject it.
        await tx.quotation.update({
          where: { id },
          data: {
            status: QuotationStatus.SENT,
            responseNote: input.note ?? 'Declined by approver',
          },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.QUOTATION_APPROVAL_DECIDED,
          entityType: 'Quotation',
          entityId: id,
          organizationId: ctx.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { decision: input.decision, note: input.note ?? null },
        },
        tx,
      );
    });
    return this.orgGet(ctx, id);
  }

  // ─── Documents ──────────────────────────────────────────────────────────

  async renderPdf(
    id: string,
    organizationId?: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id,
        ...(organizationId && {
          organizationId,
          status: { not: QuotationStatus.DRAFT },
        }),
      },
      include: quotationInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    const dto = toQuotationDto(quotation, { includeInternal: false });
    return {
      filename: `${dto.displayNumber.replace(/\s+/g, '-')}.pdf`,
      buffer: await this.pdf.render(dto),
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async buildLines(
    tx: Tx,
    items: QuotationLineInput[],
    defaultDiscountPercent: string | null,
    deliveryFee: string | undefined,
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const defaultBps = defaultDiscountPercent
      ? percentToBps(defaultDiscountPercent)
      : 0;

    const priced = items.map((item) => {
      const product = byId.get(item.productId);
      if (!product)
        throw new NotFoundException(`Product ${item.productId} not found`);
      if (!product.isActive)
        throw new UnprocessableEntityException(
          `${product.sku} is archived and cannot be quoted`,
        );
      return {
        product,
        line: {
          listPriceFils: toFils(item.listPrice ?? product.unitPrice),
          quantity: item.quantity,
          discountBps:
            item.discountRate !== undefined
              ? percentToBps(item.discountRate)
              : defaultBps,
        },
      };
    });

    const totals = calculateTotals(
      priced.map((p) => p.line),
      {
        deliveryFeeFils: deliveryFee ? toFils(deliveryFee) : 0,
        vatRateBps: VAT_RATE_BPS,
      },
    );

    return {
      items: priced.map(({ product }, index) => {
        const amounts = totals.lines[index];
        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          uom: product.uom,
          quantity: amounts.quantity,
          listPrice: fromFils(amounts.listPriceFils),
          discountRate: bpsToPercent(amounts.discountBps),
          unitPrice: fromFils(amounts.unitPriceFils),
          lineSubtotal: fromFils(amounts.lineSubtotalFils),
          vatAmount: fromFils(amounts.vatFils),
          lineTotal: fromFils(amounts.lineTotalFils),
          sortOrder: index,
        };
      }),
      totals: {
        vatRateBps: VAT_RATE_BPS,
        subtotal: fromFils(totals.subtotalFils),
        discountTotal: fromFils(totals.discountTotalFils),
        deliveryFee: fromFils(totals.deliveryFeeFils),
        vatAmount: fromFils(totals.vatFils),
        total: fromFils(totals.totalFils),
      },
    };
  }

  private linesFrom(quotation: QuotationRecord): QuotationLineInput[] {
    return quotation.items.map((item) => {
      if (!item.productId) {
        throw new ConflictException(
          `${item.sku} no longer exists in the catalog — supply the lines explicitly`,
        );
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        discountRate: Number(item.discountRate),
        listPrice: money(item.listPrice),
      };
    });
  }

  private async defaultDiscount(
    tx: Tx,
    organizationId: string | null,
  ): Promise<string | null> {
    if (!organizationId) return null;
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, discountRate: true },
    });
    return org?.status === OrgStatus.ACTIVE ? money(org.discountRate) : null;
  }

  private async openQuotationForOrg(
    ctx: OrganizationContext,
    id: string,
    expected: QuotationStatus,
  ) {
    const quotation = await this.prisma.quotation.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: { not: QuotationStatus.DRAFT },
      },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status !== expected) {
      throw new ConflictException(
        `This quotation is ${QUOTATION_STATUS_LABELS[quotation.status].toLowerCase()} and cannot be actioned`,
      );
    }
    if (isQuotationExpired(quotation.validUntil)) {
      await this.prisma.quotation.update({
        where: { id },
        data: { status: QuotationStatus.EXPIRED },
      });
      throw new ConflictException(
        'This quotation has expired. Please contact Top Flow sales for an updated quotation.',
      );
    }
    return quotation;
  }

  private async closeRfq(tx: Tx, quoteRequestId: string | null): Promise<void> {
    if (!quoteRequestId) return;
    const rfq = await tx.quoteRequest.findUnique({
      where: { id: quoteRequestId },
    });
    if (rfq && canTransition(RFQ_TRANSITIONS, rfq.status, RfqStatus.CLOSED)) {
      await tx.quoteRequest.update({
        where: { id: rfq.id },
        data: { status: RfqStatus.CLOSED },
      });
    }
  }

  private recordResponse(
    tx: Tx,
    ctx: OrganizationContext,
    id: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
    details: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record(
      {
        action: AuditAction.QUOTATION_RESPONDED,
        entityType: 'Quotation',
        entityId: id,
        organizationId: ctx.organizationId,
        userId: actor.id,
        ipAddress: meta.ipAddress,
        details,
      },
      tx,
    );
  }

  private async notifyApprovers(
    ctx: OrganizationContext,
    quotation: {
      id: string;
      number: string;
      revision: number;
      total: Prisma.Decimal;
    },
    requester: AuthenticatedUser,
    netFils: number,
  ): Promise<void> {
    const approvers = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: ctx.organizationId,
        role: { in: [OrgRole.OWNER, OrgRole.APPROVER] },
        userId: { not: requester.id },
      },
      include: { user: { select: { email: true, fullName: true } } },
    });
    const url = `${this.config.app.publicUrl}/business/quotations/${quotation.id}`;
    for (const approver of approvers) {
      if (
        approver.approvalLimit !== null &&
        toFils(approver.approvalLimit) < netFils
      )
        continue;
      this.sendMail(
        approver.user.email,
        approvalRequestEmail(
          approver.user.fullName,
          requester.fullName,
          quotationDisplayNumber(quotation.number, quotation.revision),
          formatMoney(quotation.total.toString()),
          url,
        ),
      );
    }
  }

  private filters(query: QuotationQuery): Prisma.QuotationWhereInput {
    return {
      ...(query.quoteRequestId && { quoteRequestId: query.quoteRequestId }),
      ...(query.search && {
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          {
            organization: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            purchaseOrderNumber: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      }),
    };
  }

  private async list(
    where: Prisma.QuotationWhereInput,
    query: QuotationQuery,
  ): Promise<Paginated<QuotationSummaryDto>> {
    const [quotations, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include: quotationSummaryInclude,
        orderBy: { updatedAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return paginated(quotations.map(toQuotationSummary), total, query);
  }

  private async findOrThrow(id: string): Promise<QuotationRecord> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }

  private sendMail(
    to: string,
    template: { subject: string; text: string },
  ): void {
    this.mail.send({ to, ...template }).catch((error: unknown) => {
      this.logger.error(
        `Could not send "${template.subject}" to ${to}`,
        error instanceof Error ? error.stack : error,
      );
    });
  }
}
