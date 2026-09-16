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

/** Authenticator assurance level of a session (Supabase Auth): aal2 means a second factor was verified. */
export type AssuranceLevel = 'aal1' | 'aal2';

/** Machine-readable error codes returned in `ApiErrorBody.code` so clients can react precisely. */
export const ErrorCode = {
  /** The route needs a session verified with a second factor (staff back office). */
  MFA_REQUIRED: 'MFA_REQUIRED',
  /** The platform account was disabled by an administrator. */
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** The sign-in email already belongs to a different platform account. */
  ACCOUNT_CONFLICT: 'ACCOUNT_CONFLICT',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
