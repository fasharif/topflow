import {
  acceptInvitationSchema,
  inviteMemberSchema,
  organizationQuerySchema,
  reviewOrganizationSchema,
  tokenSchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class UpdateOrganizationDto extends createZodDto(
  updateOrganizationSchema,
) {}
export class ReviewOrganizationDto extends createZodDto(
  reviewOrganizationSchema,
) {}
export class OrganizationQueryDto extends createZodDto(
  organizationQuerySchema,
) {}
export class InviteMemberDto extends createZodDto(inviteMemberSchema) {}
export class UpdateMemberDto extends createZodDto(updateMemberSchema) {}
export class AcceptInvitationDto extends createZodDto(acceptInvitationSchema) {}
export class InvitationTokenDto extends createZodDto(
  z.object({ token: tokenSchema }),
) {}
