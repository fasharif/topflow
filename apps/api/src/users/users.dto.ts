import {
  addressSchema,
  adminUpdateUserSchema,
  adminUserQuerySchema,
  createStaffUserSchema,
  registerOrganizationSchema,
  updateAddressSchema,
  updateProfileSchema,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class RegisterOrganizationDto extends createZodDto(
  registerOrganizationSchema,
) {}
export class CreateAddressDto extends createZodDto(addressSchema) {}
export class UpdateAddressDto extends createZodDto(updateAddressSchema) {}
export class AdminUserQueryDto extends createZodDto(adminUserQuerySchema) {}
export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
export class CreateStaffUserDto extends createZodDto(createStaffUserSchema) {}
