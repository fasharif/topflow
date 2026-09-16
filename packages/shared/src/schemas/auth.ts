import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../constants';
import { OrgType } from '../enums';
import {
  emailSchema,
  nameSchema,
  optionalText,
  passwordSchema,
  phoneSchema,
  trnSchema,
} from './common';

/*
 * Identity is owned by Supabase Auth: credentials, sessions, email confirmation, password
 * recovery and multi-factor authentication. These schemas validate the forms that feed it.
 * The API never receives a password; it keeps authorization (platform roles and
 * organization memberships) and provisions the platform account on first use.
 */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: nameSchema,
  phoneNumber: phoneSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2, { error: 'Enter the company name' }).max(160),
  legalName: optionalText(200),
  type: z.enum(OrgType),
  tradeLicenseNumber: z.string().trim().min(3, { error: 'Enter the trade licence number' }).max(50),
  trn: trnSchema.optional(),
  email: emailSchema.optional(),
  phoneNumber: phoneSchema.optional(),
});
export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;

/** Business sign-up: the owner's organization is created, pending KYC review, when the account is first used. */
export const registerBusinessSchema = registerSchema.extend({
  organization: organizationProfileSchema,
});
export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

/** A signed-in user opening a trade account for their company. */
export const registerOrganizationSchema = organizationProfileSchema;
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password' }).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Choosing a password after following a recovery or invitation link. */
export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'The passwords do not match',
    path: ['confirmPassword'],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Enter your current password' }).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    error: 'The new password must be different from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Six-digit code from an authenticator app (TOTP). */
export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: 'Enter the 6-digit code from your authenticator app' }),
});
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

/**
 * Profile captured at sign-up and stored as Supabase user metadata (snake_case, following
 * Supabase conventions). The API reads it once, when it provisions the platform account.
 */
export const signUpMetadataSchema = z.object({
  full_name: nameSchema.optional(),
  phone_number: phoneSchema.optional(),
  organization: organizationProfileSchema.optional(),
});
export type SignUpMetadata = z.infer<typeof signUpMetadataSchema>;
