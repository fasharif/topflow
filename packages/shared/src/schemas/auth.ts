import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from '../constants';
import { OrgType } from '../enums';
import {
  emailSchema,
  nameSchema,
  optionalText,
  passwordSchema,
  phoneSchema,
  tokenSchema,
  trnSchema,
} from './common';

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

/** Business sign-up: creates the user and a PENDING_VERIFICATION organization they own. */
export const registerBusinessSchema = registerSchema.extend({
  organization: organizationProfileSchema,
});
export type RegisterBusinessInput = z.infer<typeof registerBusinessSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Enter your password' }).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Web clients send the refresh token as an httpOnly cookie; native apps send it in the body. */
export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20).max(200).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

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
