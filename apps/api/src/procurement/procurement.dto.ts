import {
  approvalDecisionSchema,
  assignRfqCustomerSchema,
  createQuotationSchema,
  createRfqSchema,
  createWebsiteQuoteRequestSchema,
  quotationQuerySchema,
  respondPersonalQuotationSchema,
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
export class AssignRfqCustomerDto extends createZodDto(
  assignRfqCustomerSchema,
) {}
export class CreateQuotationDto extends createZodDto(createQuotationSchema) {}
export class UpdateQuotationDto extends createZodDto(updateQuotationSchema) {}
export class QuotationQueryDto extends createZodDto(quotationQuerySchema) {}
export class RespondQuotationDto extends createZodDto(respondQuotationSchema) {}
export class RespondPersonalQuotationDto extends createZodDto(
  respondPersonalQuotationSchema,
) {}
export class ApprovalDecisionDto extends createZodDto(approvalDecisionSchema) {}
