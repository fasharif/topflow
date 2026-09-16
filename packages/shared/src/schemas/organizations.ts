import { z } from 'zod';
import { OrgRole, OrgStatus, PaymentTerms } from '../enums';
import { organizationProfileSchema } from './auth';
import {
  emailSchema,
  moneySchema,
  optionalText,
  paginationSchema,
  percentSchema,
  tokenSchema,
} from './common';

/** Company profile fields an organization OWNER may edit. */
export const updateOrganizationSchema = organizationProfileSchema.partial();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** Commercial terms only Top Flow staff may set after KYC review. */
export const reviewOrganizationSchema = z
  .object({
    status: z.enum(OrgStatus).optional(),
    paymentTerms: z.enum(PaymentTerms).optional(),
    creditLimit: moneySchema.optional(),
    discountRate: percentSchema.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { error: 'Nothing to update' });
export type ReviewOrganizationInput = z.infer<typeof reviewOrganizationSchema>;

export const organizationQuerySchema = paginationSchema.extend({
  status: z.enum(OrgStatus).optional(),
  search: optionalText(100),
});
export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;

/** Spending limits are set once the invitee has joined (see updateMemberSchema). */
export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(OrgRole).default(OrgRole.BUYER),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(OrgRole).optional(),
    approvalLimit: moneySchema.nullable().optional(),
  })
  .refine((data) => data.role !== undefined || data.approvalLimit !== undefined, { error: 'Nothing to update' });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/**
 * Accepting an invitation. The invitee signs in (or creates their account) first; the API then
 * checks that the signed-in email matches the invited address.
 */
export const acceptInvitationSchema = z.object({
  token: tokenSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
