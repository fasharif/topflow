import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Product } from '@topflow/database';
import {
  DocumentType,
  EMIRATE_LABELS,
  Permission,
  RFQ_TRANSITIONS,
  RfqSource,
  RfqStatus,
  Role,
  assertTransition,
  hasPermission,
  type AssignRfqCustomerInput,
  type CreateRfqInput,
  type CreateWebsiteQuoteRequestInput,
  type Paginated,
  type RfqContactAccountDto,
  type RfqDto,
  type RfqQuery,
  type UpdateRfqInput,
  type WebsiteQuoteReceiptDto,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { IdentityAdminService } from '../auth/identity-admin.service';
import { todayInUae, uaeDate } from '../common/dates';
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
import { quoteRequestReceivedEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddressBookService,
  addressSnapshot,
  formatAddress,
} from '../users/address-book.service';
import { rfqInclude, toRfqDto } from './procurement.mapper';

interface ResolvedLine {
  product: Product;
  quantity: number;
  notes: string[];
}

function toItemRow(line: ResolvedLine) {
  return {
    productId: line.product.id,
    sku: line.product.sku,
    productName: line.product.name,
    quantity: line.quantity,
    notes: line.notes.join('; ') || null,
  };
}

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly addressBook: AddressBookService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly identities: IdentityAdminService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  /** A buyer turns their cart into a formal request for quotation. */
  async create(
    ctx: OrganizationContext,
    input: CreateRfqInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<RfqDto> {
    const lines = await this.resolveLines(input.items, {
      includeTradeOnly: true,
    });

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
          items: { create: lines.map(toItemRow) },
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
          details: { number, lines: lines.length },
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

  /**
   * A visitor on the public website asks for a quotation. There is no account or organization
   * yet: sales link the request to a customer account — inviting the contact when they have none —
   * before a formal quotation follows. Visitors may send basket items, or only describe a project.
   */
  async createFromWebsite(
    input: CreateWebsiteQuoteRequestInput,
    meta: RequestMeta,
  ): Promise<WebsiteQuoteReceiptDto> {
    if (input.requiredBy && input.requiredBy < todayInUae()) {
      throw new BadRequestException(
        'Choose a required-by date from today onwards',
      );
    }
    // Trade-only items are hidden from the public catalog, so they cannot be requested here.
    const lines =
      input.items.length > 0
        ? await this.resolveLines(input.items, { includeTradeOnly: false })
        : [];

    const rfq = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(DocumentType.QUOTE_REQUEST, tx);
      const created = await tx.quoteRequest.create({
        data: {
          number,
          source: RfqSource.WEBSITE,
          status: RfqStatus.SUBMITTED,
          contactName: input.name,
          contactEmail: input.email,
          contactPhone: input.phone,
          companyName: input.companyName,
          preferredContact: input.preferredContact,
          projectReference: input.projectReference,
          requiredBy: input.requiredBy ? uaeDate(input.requiredBy) : null,
          shippingAddress: input.emirate ? EMIRATE_LABELS[input.emirate] : null,
          notes: input.notes,
          items: { create: lines.map(toItemRow) },
        },
      });
      await this.audit.record(
        {
          action: AuditAction.RFQ_SUBMITTED,
          entityType: 'QuoteRequest',
          entityId: created.id,
          ipAddress: meta.ipAddress,
          details: { number, lines: lines.length, source: RfqSource.WEBSITE },
        },
        tx,
      );
      return created;
    });

    this.notifySales(
      `New website quote request ${rfq.number}`,
      `${input.name}${input.companyName ? ` (${input.companyName})` : ''} asked for a quotation on ${lines.length} line(s).\n${this.config.app.publicUrl}/admin/rfqs/${rfq.id}`,
    );
    this.mail
      .send({
        to: input.email,
        ...quoteRequestReceivedEmail(input.name, rfq.number, lines.length),
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Could not acknowledge quote request ${rfq.number}`,
          error instanceof Error ? error.stack : error,
        );
      });

    return {
      number: rfq.number,
      lineCount: lines.length,
      createdAt: rfq.createdAt.toISOString(),
    };
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
    return { ...toRfqDto(rfq), contactAccount: await this.contactAccount(rfq) };
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
    await this.prisma.quoteRequest.update({
      where: { id },
      data: { status: input.status, assignedToId: input.assignedToId },
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
    return this.adminGet(id);
  }

  /**
   * Links a website request to the account its quotation will be addressed to. Staff pick an
   * existing customer (optionally one of their organizations), or invite the contact: the account
   * is created from the request's details and Supabase emails a link to choose a password.
   */
  async assignCustomer(
    id: string,
    input: AssignRfqCustomerInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<RfqDto> {
    const rfq = await this.prisma.quoteRequest.findUnique({
      where: { id },
      include: { quotations: { select: { id: true } } },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    if (rfq.source !== RfqSource.WEBSITE) {
      throw new ConflictException(
        'Only website requests are linked to a customer here; trade RFQs already have one',
      );
    }
    if (rfq.status === RfqStatus.CLOSED || rfq.status === RfqStatus.CANCELLED) {
      throw new ConflictException(
        `Request ${rfq.number} is ${rfq.status.toLowerCase()} and can no longer change customer`,
      );
    }
    if (rfq.quotations.length > 0) {
      throw new ConflictException(
        'This request already has a quotation, so its customer can no longer change',
      );
    }

    let customerId: string;
    let organizationId: string | null = null;
    let invited = false;
    if (input.customerId) {
      const customer = await this.prisma.user.findUnique({
        where: { id: input.customerId },
        select: { id: true, role: true, isActive: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      if (customer.role !== Role.CUSTOMER || !customer.isActive) {
        throw new BadRequestException(
          'Quotations can only be addressed to active customer accounts',
        );
      }
      if (input.organizationId) {
        const membership = await this.prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: customer.id,
            },
          },
        });
        if (!membership) {
          throw new BadRequestException(
            'The customer is not a member of this organization',
          );
        }
        organizationId = input.organizationId;
      }
      customerId = customer.id;
    } else {
      customerId = await this.inviteContact(rfq);
      invited = true;
    }

    await this.prisma.quoteRequest.update({
      where: { id },
      data: { requestedById: customerId, organizationId },
    });
    await this.audit.record({
      action: AuditAction.RFQ_CUSTOMER_ASSIGNED,
      entityType: 'QuoteRequest',
      entityId: id,
      organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { customerId, organizationId, invited },
    });
    if (invited) {
      await this.audit.record({
        action: AuditAction.CUSTOMER_INVITED,
        entityType: 'User',
        entityId: customerId,
        userId: actor.id,
        ipAddress: meta.ipAddress,
        details: { quoteRequest: rfq.number },
      });
    }
    return this.adminGet(id);
  }

  /** Creates a customer account for a website contact and emails them an invitation. */
  private async inviteContact(rfq: {
    number: string;
    contactEmail: string | null;
    contactName: string | null;
    contactPhone: string | null;
  }): Promise<string> {
    const email = rfq.contactEmail?.toLowerCase();
    if (!email) {
      throw new ConflictException(
        `Request ${rfq.number} has no contact email to invite`,
      );
    }
    if (
      await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'An account already uses this email address — link it instead of sending an invitation',
      );
    }
    const fullName = rfq.contactName?.trim() || email;
    const id = await this.identities.inviteCustomer({
      email,
      fullName,
      phoneNumber: rfq.contactPhone ?? undefined,
      redirectTo: `${this.config.app.publicUrl}/auth/set-password`,
    });
    try {
      await this.prisma.user.create({
        data: {
          id,
          email,
          fullName,
          phoneNumber: rfq.contactPhone,
          role: Role.CUSTOMER,
        },
      });
    } catch (error) {
      await this.identities.deleteIdentity(id);
      throw error;
    }
    return id;
  }

  /** The account already using a website contact's email, until the request is linked to a customer. */
  private async contactAccount(rfq: {
    source: string;
    requestedById: string | null;
    contactEmail: string | null;
  }): Promise<RfqContactAccountDto | null> {
    if (
      rfq.source !== RfqSource.WEBSITE ||
      rfq.requestedById ||
      !rfq.contactEmail
    ) {
      return null;
    }
    const account = await this.prisma.user.findFirst({
      where: { email: { equals: rfq.contactEmail, mode: 'insensitive' } },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        memberships: {
          select: { organization: { select: { id: true, name: true } } },
        },
      },
    });
    if (!account) return null;
    return {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      isActive: account.isActive,
      organizations: account.memberships.map(
        (membership) => membership.organization,
      ),
    };
  }

  private filters(query: RfqQuery): Prisma.QuoteRequestWhereInput {
    return {
      ...(query.status && { status: query.status }),
      ...(query.source && { source: query.source }),
      ...(query.search && {
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          { projectReference: { contains: query.search, mode: 'insensitive' } },
          {
            organization: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          { contactEmail: { contains: query.search, mode: 'insensitive' } },
          { companyName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  /**
   * Merges repeated products into one line, then checks that each product is still sold, is
   * visible to the requester and is ordered in at least its minimum quantity.
   */
  private async resolveLines(
    items: ReadonlyArray<{
      productId: string;
      quantity: number;
      notes?: string;
    }>,
    options: { includeTradeOnly: boolean },
  ): Promise<ResolvedLine[]> {
    const merged = new Map<string, { quantity: number; notes: string[] }>();
    for (const item of items) {
      const line = merged.get(item.productId) ?? { quantity: 0, notes: [] };
      line.quantity += item.quantity;
      if (item.notes) line.notes.push(item.notes);
      merged.set(item.productId, line);
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...merged.keys()] },
        isActive: true,
        ...(!options.includeTradeOnly && { isTradeOnly: false }),
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return [...merged].map(([productId, line]) => {
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
      return { product, ...line };
    });
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
