export const CURRENCY = 'AED';

/** UAE standard VAT rate (5%) in basis points. */
export const VAT_RATE_BPS = 500;

export const QUOTATION_DEFAULT_VALIDITY_DAYS = 14;
export const QUOTATION_MAX_VALIDITY_DAYS = 90;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Prefixes for human-readable, sequential document numbers (e.g. TF-SO-2026-000123). */
export const DocumentType = {
  SALES_ORDER: 'TF-SO',
  QUOTATION: 'TF-QT',
  QUOTE_REQUEST: 'TF-RFQ',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/** Header clients send to act inside one of their organizations (B2B tenant context). */
export const ORGANIZATION_HEADER = 'x-organization-id';
