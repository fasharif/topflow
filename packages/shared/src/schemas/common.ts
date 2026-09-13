import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../constants';
import { fromFils, toFils } from '../money';

export const idSchema = z.uuid({ error: 'Invalid identifier' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(PASSWORD_MAX_LENGTH, { error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` })
  .regex(/[A-Za-z]/, { error: 'Password must contain at least one letter' })
  .regex(/\d/, { error: 'Password must contain at least one number' });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?\d[\d\s-]{6,18}$/, { error: 'Enter a valid phone number, e.g. +971 50 123 4567' });

export const nameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Must be at least 2 characters' })
  .max(120, { error: 'Must be at most 120 characters' });

/** Single-use token from an email link. */
export const tokenSchema = z.string().trim().min(20).max(200);

/** UAE VAT Tax Registration Number. */
export const trnSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, { error: 'A UAE TRN is exactly 15 digits' });

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Use lowercase letters, numbers and single hyphens' });

/** Optional free text: trims, and treats an empty string as "not provided". */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Must be at most ${max} characters` })
    .transform((value) => (value === '' ? undefined : value))
    .optional();
}

/** Non-negative AED amount given as a number or decimal string; normalised to "123.45". */
export const moneySchema = z.union([z.number(), z.string().trim()]).transform((value, ctx) => {
  try {
    const fils = toFils(value);
    if (fils < 0) {
      ctx.issues.push({ code: 'custom', message: 'Amount cannot be negative', input: value });
      return z.NEVER;
    }
    if (fils > 100_000_000_00) {
      ctx.issues.push({ code: 'custom', message: 'Amount is too large', input: value });
      return z.NEVER;
    }
    return fromFils(fils);
  } catch {
    ctx.issues.push({ code: 'custom', message: 'Enter a valid amount, e.g. 125.50', input: value });
    return z.NEVER;
  }
});

/** Percentage between 0 and 100 (e.g. a trade discount). */
export const percentSchema = z.coerce
  .number({ error: 'Enter a percentage' })
  .min(0, { error: 'Cannot be below 0%' })
  .max(100, { error: 'Cannot exceed 100%' });

export const isoDateSchema = z.iso.date({ error: 'Use the YYYY-MM-DD format' });

export const quantitySchema = z
  .number({ error: 'Quantity must be a number' })
  .int({ error: 'Quantity must be a whole number' })
  .min(1, { error: 'Quantity must be at least 1' })
  .max(100_000, { error: 'Quantity is too large' });

export const lineItemSchema = z.object({
  productId: idSchema,
  quantity: quantitySchema,
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;
