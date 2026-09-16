import { z } from 'zod';
import { QUOTATION_DEFAULT_VALIDITY_DAYS, QUOTATION_MAX_VALIDITY_DAYS } from '../constants';
import { ContactChannel, Emirate, QuotationStatus, RfqSource, RfqStatus } from '../enums';
import { ApprovalDecision, QuotationResponse } from '../workflows/quotation';
import {
  emailSchema,
  idSchema,
  isoDateSchema,
  moneySchema,
  nameSchema,
  optionalText,
  paginationSchema,
  percentSchema,
  phoneSchema,
  quantitySchema,
} from './common';

// ─── Requests for quotation (customer → Top Flow) ─────────────────────────

export const createRfqSchema = z.object({
  items: z
    .array(z.object({ productId: idSchema, quantity: quantitySchema, notes: optionalText(300) }))
    .min(1, { error: 'Add at least one product' })
    .max(200, { error: 'An RFQ can contain at most 200 lines' }),
  projectReference: optionalText(120),
  /** Delivery site from the organization's address book. */
  addressId: idSchema.optional(),
  requiredBy: isoDateSchema.optional(),
  notes: optionalText(2000),
});
export type CreateRfqInput = z.infer<typeof createRfqSchema>;

/** Minimum description for a project enquiry that lists no catalogue products. */
export const PROJECT_ENQUIRY_MIN_LENGTH = 20;

/**
 * A visitor on the public website asks for a quotation. No account is needed. Visitors either
 * send the products in their basket, or describe a project (for example from a bill of
 * quantities) and let the sales team propose the items.
 */
export const createWebsiteQuoteRequestSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    companyName: optionalText(160),
    emirate: z.enum(Emirate).optional(),
    preferredContact: z.enum(ContactChannel).optional(),
    projectReference: optionalText(120),
    requiredBy: isoDateSchema.optional(),
    notes: optionalText(2000),
    items: z
      .array(z.object({ productId: idSchema, quantity: quantitySchema, notes: optionalText(300) }))
      .max(100, { error: 'A quote request can contain at most 100 lines' })
      .default([]),
  })
  .refine((data) => data.items.length > 0 || (data.notes?.length ?? 0) >= PROJECT_ENQUIRY_MIN_LENGTH, {
    error: `Add products from the catalogue, or describe what you need in at least ${PROJECT_ENQUIRY_MIN_LENGTH} characters`,
    path: ['notes'],
  });
export type CreateWebsiteQuoteRequestInput = z.infer<typeof createWebsiteQuoteRequestSchema>;

export const rfqQuerySchema = paginationSchema.extend({
  status: z.enum(RfqStatus).optional(),
  source: z.enum(RfqSource).optional(),
  organizationId: idSchema.optional(),
  search: optionalText(100),
});
export type RfqQuery = z.infer<typeof rfqQuerySchema>;

/** Staff triage: assign a sales owner and/or move the RFQ along its lifecycle. */
export const updateRfqSchema = z
  .object({
    status: z.enum(RfqStatus).optional(),
    assignedToId: idSchema.nullable().optional(),
  })
  .refine((data) => data.status !== undefined || data.assignedToId !== undefined, { error: 'Nothing to update' });
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;

// ─── Quotations (Top Flow → customer) ─────────────────────────────────────

export const quotationLineSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
  /** Line discount in percent. Defaults to the organization's negotiated rate. */
  discountRate: percentSchema.optional(),
  /** Overrides the catalog list price for this quotation (net, AED). */
  listPrice: moneySchema.optional(),
});
export type QuotationLineInput = z.infer<typeof quotationLineSchema>;

const quotationContentShape = {
  items: z
    .array(quotationLineSchema)
    .min(1, { error: 'Add at least one line' })
    .max(200, { error: 'A quotation can contain at most 200 lines' }),
  deliveryFee: moneySchema,
  validityDays: z.number().int().min(1).max(QUOTATION_MAX_VALIDITY_DAYS),
  terms: optionalText(4000),
  notes: optionalText(2000),
  internalNotes: optionalText(2000),
};

export const createQuotationSchema = z
  .object({
    ...quotationContentShape,
    quoteRequestId: idSchema.optional(),
    customerId: idSchema.optional(),
    organizationId: idSchema.optional(),
    deliveryFee: quotationContentShape.deliveryFee.optional(),
    validityDays: quotationContentShape.validityDays.default(QUOTATION_DEFAULT_VALIDITY_DAYS),
  })
  .refine((data) => data.quoteRequestId !== undefined || data.customerId !== undefined, {
    error: 'Link the quotation to an RFQ or to a customer',
    path: ['customerId'],
  });
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

/** Edits a DRAFT in place, or seeds revision n+1 when used on a sent quotation. */
export const updateQuotationSchema = z.object(quotationContentShape).partial();
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const quotationQuerySchema = paginationSchema.extend({
  status: z.enum(QuotationStatus).optional(),
  organizationId: idSchema.optional(),
  quoteRequestId: idSchema.optional(),
  search: optionalText(100),
});
export type QuotationQuery = z.infer<typeof quotationQuerySchema>;

/** Customer response to a sent quotation. Rejections and revision requests must explain why. */
export const respondQuotationSchema = z
  .object({
    action: z.enum(QuotationResponse),
    purchaseOrderNumber: optionalText(60),
    note: optionalText(1000),
  })
  .refine((data) => data.action === QuotationResponse.ACCEPT || (data.note?.length ?? 0) >= 3, {
    error: 'Please add a short note explaining your decision',
    path: ['note'],
  });
export type RespondQuotationInput = z.infer<typeof respondQuotationSchema>;

/** Organization approver's decision on a purchase that exceeded the buyer's limit. */
export const approvalDecisionSchema = z.object({
  decision: z.enum(ApprovalDecision),
  note: optionalText(1000),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
