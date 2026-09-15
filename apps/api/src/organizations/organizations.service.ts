import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  OrgRole,
  OrgStatus,
  type MemberDto,
  type OrganizationDto,
  type OrganizationQuery,
  type Paginated,
  type ReviewOrganizationInput,
  type UpdateMemberInput,
  type UpdateOrganizationInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { pageArgs, paginated } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';
import { toMemberDto, toOrganizationDto } from './organization.mapper';

const withMemberCount = {
  _count: { select: { members: true } },
} satisfies Prisma.OrganizationInclude;
const memberInclude = {
  user: { select: { fullName: true, email: true } },
} satisfies Prisma.OrganizationMemberInclude;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Tenant (customer) side ─────────────────────────────────────────────

  async getProfile(ctx: OrganizationContext): Promise<OrganizationDto> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      include: withMemberCount,
    });
    return toOrganizationDto(org);
  }

  /**
   * Owners maintain their company profile. Changing a legal identifier (TRN or trade licence)
   * on a verified account sends it back to KYC review.
   */
  async updateProfile(
    ctx: OrganizationContext,
    input: UpdateOrganizationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<OrganizationDto> {
    const current = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    const identifiersChanged =
      (input.trn !== undefined && input.trn !== current.trn) ||
      (input.tradeLicenseNumber !== undefined &&
        input.tradeLicenseNumber !== current.tradeLicenseNumber);
    const requiresReverification =
      identifiersChanged && current.status === OrgStatus.ACTIVE;

    const org = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        ...input,
        ...(requiresReverification && {
          status: OrgStatus.PENDING_VERIFICATION,
          verifiedAt: null,
        }),
      },
      include: withMemberCount,
    });
    await this.audit.record({
      action: AuditAction.ORGANIZATION_UPDATED,
      entityType: 'Organization',
      entityId: org.id,
      organizationId: org.id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { fields: Object.keys(input), requiresReverification },
    });
    return toOrganizationDto(org);
  }

  async listMembers(organizationId: string): Promise<MemberDto[]> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: memberInclude,
      orderBy: { createdAt: 'asc' },
    });
    return members.map(toMemberDto);
  }

  async updateMember(
    ctx: OrganizationContext,
    memberId: string,
    input: UpdateMemberInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<MemberDto> {
    const member = await this.findMember(ctx.organizationId, memberId);
    if (
      member.role === OrgRole.OWNER &&
      input.role !== undefined &&
      input.role !== OrgRole.OWNER
    ) {
      await this.assertAnotherOwner(ctx.organizationId, member.id);
    }
    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { role: input.role, approvalLimit: input.approvalLimit },
      include: memberInclude,
    });
    await this.audit.record({
      action: AuditAction.MEMBER_UPDATED,
      entityType: 'OrganizationMember',
      entityId: member.id,
      organizationId: ctx.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { ...input },
    });
    return toMemberDto(updated);
  }

  async removeMember(
    ctx: OrganizationContext,
    memberId: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    const member = await this.findMember(ctx.organizationId, memberId);
    if (member.role === OrgRole.OWNER) {
      await this.assertAnotherOwner(ctx.organizationId, member.id);
    }
    await this.prisma.organizationMember.delete({ where: { id: member.id } });
    await this.audit.record({
      action: AuditAction.MEMBER_REMOVED,
      entityType: 'OrganizationMember',
      entityId: member.id,
      organizationId: ctx.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { removedUserId: member.userId },
    });
  }

  // ─── Top Flow staff side ────────────────────────────────────────────────

  async adminList(
    query: OrganizationQuery,
  ): Promise<Paginated<OrganizationDto>> {
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { legalName: { contains: query.search, mode: 'insensitive' } },
          { trn: { contains: query.search } },
          {
            tradeLicenseNumber: { contains: query.search, mode: 'insensitive' },
          },
        ],
      }),
    };
    const [orgs, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        include: withMemberCount,
        // Pending KYC reviews first, then newest.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paginated(orgs.map(toOrganizationDto), total, query);
  }

  async adminGet(
    id: string,
  ): Promise<{ organization: OrganizationDto; members: MemberDto[] }> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: withMemberCount,
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return {
      organization: toOrganizationDto(org),
      members: await this.listMembers(id),
    };
  }

  /** KYC decision and commercial terms (payment terms, credit limit, trade discount). */
  async review(
    id: string,
    input: ReviewOrganizationInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<OrganizationDto> {
    const current = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.prisma.organization.update({
      where: { id },
      data: {
        status: input.status,
        paymentTerms: input.paymentTerms,
        creditLimit: input.creditLimit,
        discountRate:
          input.discountRate === undefined
            ? undefined
            : String(input.discountRate),
        ...(input.status === OrgStatus.ACTIVE &&
          !current.verifiedAt && { verifiedAt: new Date() }),
      },
      include: withMemberCount,
    });
    await this.audit.record({
      action: AuditAction.ORGANIZATION_REVIEWED,
      entityType: 'Organization',
      entityId: id,
      organizationId: id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { ...input, previousStatus: current.status },
    });
    return toOrganizationDto(org);
  }

  private async findMember(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  private async assertAnotherOwner(
    organizationId: string,
    excludingMemberId: string,
  ): Promise<void> {
    const otherOwners = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: OrgRole.OWNER,
        id: { not: excludingMemberId },
      },
    });
    if (otherOwners === 0) {
      throw new ConflictException(
        'An organization must always have at least one owner',
      );
    }
  }
}
