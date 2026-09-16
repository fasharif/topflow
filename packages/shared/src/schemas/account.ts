import { z } from 'zod';
import { Emirate, Role } from '../enums';
import {
  emailSchema,
  nameSchema,
  optionalText,
  paginationSchema,
  phoneSchema,
} from './common';

export const updateProfileSchema = z
  .object({
    fullName: nameSchema.optional(),
    phoneNumber: phoneSchema.nullable().optional(),
  })
  .refine((data) => data.fullName !== undefined || data.phoneNumber !== undefined, {
    error: 'Nothing to update',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const addressShape = {
  label: z.string().trim().min(1, { error: 'Give this address a name' }).max(60),
  contactName: nameSchema,
  phoneNumber: phoneSchema,
  line1: z.string().trim().min(3, { error: 'Enter the street, building or villa' }).max(200),
  line2: optionalText(200),
  area: z.string().trim().min(2, { error: 'Enter the area or community' }).max(100),
  city: z.string().trim().min(2, { error: 'Enter the city' }).max(100),
  emirate: z.enum(Emirate),
  isDefault: z.boolean(),
};

export const addressSchema = z.object({ ...addressShape, isDefault: addressShape.isDefault.default(false) });
export type AddressInput = z.infer<typeof addressSchema>;

export const updateAddressSchema = z.object(addressShape).partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const adminUserQuerySchema = paginationSchema.extend({
  search: optionalText(100),
  role: z.enum(Role).optional(),
});
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(Role).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.isActive !== undefined, { error: 'Nothing to update' });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

/**
 * Administrators invite staff (sales, warehouse, admin). Supabase Auth emails the invitation;
 * the new colleague sets their own password, so no administrator ever knows it.
 */
export const createStaffUserSchema = z.object({
  email: emailSchema,
  fullName: nameSchema,
  phoneNumber: phoneSchema.optional(),
  role: z.enum([Role.SALES, Role.WAREHOUSE, Role.ADMIN]),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;
