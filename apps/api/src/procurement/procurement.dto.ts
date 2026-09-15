import {
  approvalDecisionSchema,
  createQuotationSchema,
  createRfqSchema,
  createWebsiteQuoteRequestSchema,
  quotationQuerySchema,
  respondQuotationSchema,
  rfqQuerySchema,
  updateQuotationSchema,
  updateRfqSchema,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateRfqDto extends createZodDto(createRfqSchema) {}
export class CreateWebsiteQuoteRequestDto extends createZodDto(
  createWebsiteQuoteRequestSchema,
) {}
export class RfqQueryDto extends createZodDto(rfqQuerySchema) {}
export class UpdateRfqDto extends createZodDto(updateRfqSchema) {}
export class CreateQuotationDto extends createZodDto(createQuotationSchema) {}
export class UpdateQuotationDto extends createZodDto(updateQuotationSchema) {}
export class QuotationQueryDto extends createZodDto(quotationQuerySchema) {}
export class RespondQuotationDto extends createZodDto(respondQuotationSchema) {}
export class ApprovalDecisionDto extends createZodDto(approvalDecisionSchema) {}
