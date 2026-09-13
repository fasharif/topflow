import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  DocumentType,
  Permission,
  RFQ_TRANSITIONS,
  RfqStatus,
  assertTransition,
  hasPermission,
  type CreateRfqInput,
  type Paginated,
  type RfqDto,
  type RfqQuery,
  type UpdateRfqInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { uaeDate } from '../common/dates';
import { NumberingService } from '../common/numbering.service';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { pageArgs, paginated } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddressBookService,
  addressSnapshot,
  formatAddress,
} from '../users/address-book.service';
import { rfqInclude, toRfqDto } from './procurement.mapper';

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly addressBook: AddressBookService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /** A buyer turns their cart into a formal request for quotation. */
  async create(
    ctx: OrganizationContext,
    input: CreateRfqInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<RfqDto> {
    // The same product added twice becomes one line.
    const lines = new Map<string, { quantity: number; notes: string[] }>();
    for (const item of input.items) {
      const line = lines.get(item.productId) ?? { quantity: 0, notes: [] };
      line.quantity += item.quantity;
      if (item.notes) line.notes.push(item.notes);
      lines.set(item.productId, line);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: [...lines.keys()] }, isActive: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const [productId, line] of lines) {
      const product = byId.get(productId);
      if (!product) {
        throw new NotFoundException(
          'One or more products are no longer available',
        );
      }
      if (line.quantity < product.minOrderQty) {
        throw new BadRequestException(
          `The minimum order quantity for ${product.sku} is ${product.minOrderQty}`,
        );
      }
    }

    const site = input.addressId
      ? await this.addressBook.get(
          { organizationId: ctx.organizationId },
          input.addressId,
        )
      : null;
    const snapshot = site ? addressSnapshot(site) : null;

    const rfq = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(DocumentType.QUOTE_REQUEST, tx);
      const created = await tx.quoteRequest.create({
        data: {
          number,
          organizationId: ctx.organizationId,
          requestedById: actor.id,
          status: RfqStatus.SUBMITTED,
          projectReference: input.projectReference,
          shippingAddress: snapshot ? formatAddress(snapshot) : null,
          deliveryAddress: snapshot ?? undefined,
          requiredBy: input.requiredBy ? uaeDate(input.requiredBy) : null,
          notes: input.notes,
          items: {
            create: [...lines].map(([productId, line]) => {
              const product = byId.get(productId)!;
              return {
                productId,
                sku: product.sku,
                productName: product.name,
                quantity: line.quantity,
                notes: line.notes.join('; ') || null,
              };
            }),
          },
        },
        include: rfqInclude(false),
      });
      await this.audit.record(
        {
          action: AuditAction.RFQ_SUBMITTED,
          entityType: 'QuoteRequest',
          entityId: created.id,
          organizationId: ctx.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { number, lines: lines.size },
        },
        tx,
      );
      return created;
    });

    this.notifySales(
      `New RFQ ${rfq.number} from ${ctx.organizationName}`,
      `${actor.fullName} submitted ${rfq.items.length} line(s).\n${this.config.app.publicUrl}/admin/rfqs/${rfq.id}`,
    );
    return toRfqDto(rfq);
  }

  async listForOrganization(
    ctx: OrganizationContext,
    query: RfqQuery,
  ): Promise<Paginated<RfqDto>> {
    return this.list(
      { ...this.filters(query), organizationId: ctx.organizationId },
      query,
      false,
    );
  }

  async getForOrganization(
    ctx: OrganizationContext,
    id: string,
  ): Promise<RfqDto> {
    const rfq = await this.prisma.quoteRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: rfqInclude(false),
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return toRfqDto(rfq);
  }

  async cancel(
    ctx: OrganizationContext,
    id: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<RfqDto> {
    const rfq = await this.prisma.quoteRequest.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    assertTransition(RFQ_TRANSITIONS, rfq.status, RfqStatus.CANCELLED, 'RFQ');
    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: { status: RfqStatus.CANCELLED },
      include: rfqInclude(false),
    });
    await this.audit.record({
      action: AuditAction.RFQ_UPDATED,
      entityType: 'QuoteRequest',
      entityId: id,
      organizationId: ctx.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { status: RfqStatus.CANCELLED },
    });
    return toRfqDto(updated);
  }

  async adminList(query: RfqQuery): Promise<Paginated<RfqDto>> {
    return this.list(
      {
        ...this.filters(query),
        ...(query.organizationId && { organizationId: query.organizationId }),
      },
      query,
      true,
    );
  }

  async adminGet(id: string): Promise<RfqDto> {
    const rfq = await this.prisma.quoteRequest.findUnique({
      where: { id },
      include: rfqInclude(true),
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return toRfqDto(rfq);
  }

  /** Sales triage: assign an owner and/or move the RFQ along its lifecycle. */
  async adminUpdate(
    id: string,
    input: UpdateRfqInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<RfqDto> {
    const rfq = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (input.status && input.status !== rfq.status) {
      assertTransition(RFQ_TRANSITIONS, rfq.status, input.status, 'RFQ');
    }
    if (input.assignedToId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: input.assignedToId },
        select: { role: true, isActive: true },
      });
      if (
        !assignee?.isActive ||
        !hasPermission(assignee.role, Permission.RFQS_MANAGE)
      ) {
        throw new BadRequestException(
          'RFQs can only be assigned to active sales staff',
        );
      }
    }
    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: { status: input.status, assignedToId: input.assignedToId },
      include: rfqInclude(true),
    });
    await this.audit.record({
      action: AuditAction.RFQ_UPDATED,
      entityType: 'QuoteRequest',
      entityId: id,
      organizationId: rfq.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { ...input },
    });
    return toRfqDto(updated);
  }

  private filters(query: RfqQuery): Prisma.QuoteRequestWhereInput {
    return {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { projectReference: { contains: query.search, mode: 'insensitive' } },
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
    where: Prisma.QuoteRequestWhereInput,
    query: RfqQuery,
    includeDrafts: boolean,
  ): Promise<Paginated<RfqDto>> {
    const [rfqs, total] = await this.prisma.$transaction([
      this.prisma.quoteRequest.findMany({
        where,
        include: rfqInclude(includeDrafts),
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.quoteRequest.count({ where }),
    ]);
    return paginated(rfqs.map(toRfqDto), total, query);
  }

  private notifySales(subject: string, text: string): void {
    this.mail
      .send({ to: this.config.company.email, subject, text })
      .catch((error: unknown) => {
        this.logger.error(
          `Could not notify sales: ${subject}`,
          error instanceof Error ? error.stack : error,
        );
      });
  }
}
