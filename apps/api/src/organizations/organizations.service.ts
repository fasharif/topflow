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
import { concurrentUpdate } from '../common/concurrency';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { pageArgs, paginated } from '../common/serialization';
import { DemoPolicy } from '../demo/demo-policy';
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
    private readonly demo: DemoPolicy,
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
   * on a verified account sends it back to KYC review, so the public demo refuses it for the
   * published demo organisation.
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
    if (identifiersChanged) {
      this.demo.assertMayChangeOrganization(current.trn, 'identifiers');
    }
    const requiresReverification =
      identifiersChanged && current.status === OrgStatus.ACTIVE;

    // A change of legal identifier is decided on the status that was read (it may send a verified
    // account back to review), so it is written only if the status is still that one. Otherwise a
    // suspension or a KYC decision made at the same moment would be overwritten or bypassed.
    const { count } = await this.prisma.organization.updateMany({
      where: {
        id: ctx.organizationId,
        ...(identifiersChanged && { status: current.status }),
      },
      data: {
        ...input,
        ...(requiresReverification && {
          status: OrgStatus.PENDING_VERIFICATION,
          verifiedAt: null,
        }),
      },
    });
    if (count !== 1) throw concurrentUpdate('company profile');
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
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
    this.demo.assertMayChangeAccount(member.user.email);
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockedMember(tx, ctx.organizationId, memberId);
      if (
        current.role === OrgRole.OWNER &&
        input.role !== undefined &&
        input.role !== OrgRole.OWNER
      ) {
        await this.assertAnotherOwner(tx, ctx.organizationId, current.id);
      }
      return tx.organizationMember.update({
        where: { id: current.id },
        data: { role: input.role, approvalLimit: input.approvalLimit },
        include: memberInclude,
      });
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
    this.demo.assertMayChangeAccount(member.user.email);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockedMember(tx, ctx.organizationId, memberId);
      if (current.role === OrgRole.OWNER) {
        await this.assertAnotherOwner(tx, ctx.organizationId, current.id);
      }
      await tx.organizationMember.delete({ where: { id: current.id } });
    });
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

  /**
   * KYC decision and commercial terms (payment terms, credit limit, trade discount). The public demo
   * keeps the published demo organisation's status and terms fixed.
   */
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
    this.demo.assertMayChangeOrganization(current.trn, 'review');
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
      include: { user: { select: { email: true } } },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  /**
   * The member as it is now, read while the organisation's row is locked (SELECT … FOR UPDATE).
   * "There is another owner" is a statement about several rows, so no single conditional write can
   * guard it. The lock makes changes to one organisation's members run one after the other: two
   * owners who demote or remove each other at the same moment are handled in turn, and the second
   * request finds that it would leave no owner. The role is read again under the lock because the
   * request before it may have changed it.
   */
  private async lockedMember(
    tx: Prisma.TransactionClient,
    organizationId: string,
    memberId: string,
  ) {
    await tx.$queryRaw`
      SELECT "id" FROM "organizations"
      WHERE "id" = ${organizationId}
      FOR UPDATE`;
    const member = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    return member;
  }

  /** Call with the organisation's row locked (lockedMember), or the count can be out of date. */
  private async assertAnotherOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    excludingMemberId: string,
  ): Promise<void> {
    const otherOwners = await tx.organizationMember.count({
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
