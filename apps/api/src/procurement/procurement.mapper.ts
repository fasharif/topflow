import type { Prisma, QuotationItem } from '@topflow/database';
import {
  QuotationStatus,
  isQuotationExpired,
  isQuotationOpen,
  quotationDisplayNumber,
  type AddressSnapshot,
  type DocumentLineDto,
  type QuotationDto,
  type QuotationSummaryDto,
  type RfqDto,
} from '@topflow/shared';
import { isoOrNull, money } from '../common/serialization';

const userRef = { select: { id: true, fullName: true, email: true } } as const;
const staffRef = { select: { id: true, fullName: true } } as const;

export const quotationSummaryInclude = {
  organization: { select: { id: true, name: true } },
  customer: userRef,
} satisfies Prisma.QuotationInclude;

export const quotationInclude = {
  items: { orderBy: { sortOrder: 'asc' } },
  organization: { select: { id: true, name: true, trn: true } },
  customer: userRef,
  createdBy: staffRef,
  respondedBy: staffRef,
  approvedBy: staffRef,
  quoteRequest: { select: { id: true, number: true } },
  order: { select: { id: true, orderNumber: true } },
} satisfies Prisma.QuotationInclude;

export type QuotationSummaryRecord = Prisma.QuotationGetPayload<{
  include: typeof quotationSummaryInclude;
}>;
export type QuotationRecord = Prisma.QuotationGetPayload<{
  include: typeof quotationInclude;
}>;

export function rfqInclude(includeDrafts: boolean) {
  return {
    items: true,
    organization: { select: { id: true, name: true } },
    requestedBy: userRef,
    assignedTo: staffRef,
    quotations: {
      where: includeDrafts ? {} : { status: { not: QuotationStatus.DRAFT } },
      include: quotationSummaryInclude,
      orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
    },
  } satisfies Prisma.QuoteRequestInclude;
}

export type RfqRecord = Prisma.QuoteRequestGetPayload<{
  include: ReturnType<typeof rfqInclude>;
}>;

/** Open quotations past their validity date are reported as expired even before a job flips the status. */
function expired(quotation: {
  status: QuotationStatus;
  validUntil: Date;
}): boolean {
  return (
    quotation.status === QuotationStatus.EXPIRED ||
    (isQuotationOpen(quotation.status) &&
      isQuotationExpired(quotation.validUntil))
  );
}

export function toQuotationLine(item: QuotationItem): DocumentLineDto {
  return {
    id: item.id,
    productId: item.productId,
    sku: item.sku,
    productName: item.productName,
    uom: item.uom,
    quantity: item.quantity,
    listPrice: money(item.listPrice),
    discountRate: money(item.discountRate),
    unitPrice: money(item.unitPrice),
    lineSubtotal: money(item.lineSubtotal),
    vatAmount: money(item.vatAmount),
    lineTotal: money(item.lineTotal),
  };
}

export function toQuotationSummary(
  quotation: QuotationSummaryRecord,
): QuotationSummaryDto {
  return {
    id: quotation.id,
    number: quotation.number,
    revision: quotation.revision,
    displayNumber: quotationDisplayNumber(quotation.number, quotation.revision),
    status: quotation.status,
    total: money(quotation.total),
    validUntil: quotation.validUntil.toISOString(),
    isExpired: expired(quotation),
    organization: quotation.organization,
    customer: quotation.customer,
    createdAt: quotation.createdAt.toISOString(),
  };
}

export function toQuotationDto(
  quotation: QuotationRecord,
  options: { includeInternal: boolean },
): QuotationDto {
  return {
    ...toQuotationSummary(quotation),
    quoteRequest: quotation.quoteRequest,
    organization: quotation.organization,
    createdBy: quotation.createdBy,
    currency: quotation.currency,
    vatRateBps: quotation.vatRateBps,
    subtotal: money(quotation.subtotal),
    discountTotal: money(quotation.discountTotal),
    deliveryFee: money(quotation.deliveryFee),
    vatAmount: money(quotation.vatAmount),
    terms: quotation.terms,
    notes: quotation.notes,
    ...(options.includeInternal && { internalNotes: quotation.internalNotes }),
    sentAt: isoOrNull(quotation.sentAt),
    respondedAt: isoOrNull(quotation.respondedAt),
    respondedBy: quotation.respondedBy,
    responseNote: quotation.responseNote,
    purchaseOrderNumber: quotation.purchaseOrderNumber,
    approvedBy: quotation.approvedBy,
    approvedAt: isoOrNull(quotation.approvedAt),
    items: quotation.items.map(toQuotationLine),
    orderId: quotation.order?.id ?? null,
    orderNumber: quotation.order?.orderNumber ?? null,
    updatedAt: quotation.updatedAt.toISOString(),
  };
}

export function toRfqDto(rfq: RfqRecord): RfqDto {
  return {
    id: rfq.id,
    number: rfq.number,
    status: rfq.status,
    organization: rfq.organization,
    requestedBy: rfq.requestedBy,
    assignedTo: rfq.assignedTo,
    projectReference: rfq.projectReference,
    shippingAddress: rfq.shippingAddress,
    deliveryAddress: (rfq.deliveryAddress as AddressSnapshot | null) ?? null,
    requiredBy: isoOrNull(rfq.requiredBy),
    notes: rfq.notes,
    items: rfq.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sku: item.sku,
      productName: item.productName,
      quantity: item.quantity,
      notes: item.notes,
    })),
    quotations: rfq.quotations.map(toQuotationSummary),
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
  };
}
