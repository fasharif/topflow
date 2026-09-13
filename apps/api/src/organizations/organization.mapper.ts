import type {
  Organization,
  OrganizationInvitation,
  OrganizationMember,
} from '@topflow/database';
import type {
  InvitationDto,
  MemberDto,
  OrganizationDto,
} from '@topflow/shared';
import { isoOrNull, money, moneyOrNull } from '../common/serialization';

export function toOrganizationDto(
  org: Organization & { _count?: { members: number } },
): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    legalName: org.legalName,
    type: org.type,
    status: org.status,
    tradeLicenseNumber: org.tradeLicenseNumber,
    trn: org.trn,
    email: org.email,
    phoneNumber: org.phoneNumber,
    paymentTerms: org.paymentTerms,
    creditLimit: money(org.creditLimit),
    discountRate: money(org.discountRate),
    verifiedAt: isoOrNull(org.verifiedAt),
    createdAt: org.createdAt.toISOString(),
    memberCount: org._count?.members,
  };
}

export function toMemberDto(
  member: OrganizationMember & { user: { fullName: string; email: string } },
): MemberDto {
  return {
    id: member.id,
    userId: member.userId,
    fullName: member.user.fullName,
    email: member.user.email,
    role: member.role,
    approvalLimit: moneyOrNull(member.approvalLimit),
    createdAt: member.createdAt.toISOString(),
  };
}

export function toInvitationDto(
  invitation: OrganizationInvitation & {
    invitedBy: { fullName: string } | null;
  },
): InvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    invitedBy: invitation.invitedBy?.fullName ?? null,
  };
}
