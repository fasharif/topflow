import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ORG_ROLE_LABELS,
  type AcceptInvitationInput,
  type InvitationDto,
  type InvitationPreviewDto,
  type InviteMemberInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { generateSecret, hashSecret } from '../common/secrets';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { MailService } from '../mail/mail.service';
import { invitationEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { toInvitationDto } from './organization.mapper';

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async listPending(organizationId: string): Promise<InvitationDto[]> {
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { invitedBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(toInvitationDto);
  }

  async invite(
    ctx: OrganizationContext,
    input: InviteMemberInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<InvitationDto> {
    const alreadyMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: ctx.organizationId,
        user: { email: input.email },
      },
      select: { id: true },
    });
    if (alreadyMember) {
      throw new ConflictException(
        'This person is already a member of your organization',
      );
    }

    const token = generateSecret();
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Re-inviting replaces any earlier pending invitation for the same address.
      await tx.organizationInvitation.updateMany({
        where: {
          organizationId: ctx.organizationId,
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      const created = await tx.organizationInvitation.create({
        data: {
          organizationId: ctx.organizationId,
          email: input.email,
          role: input.role,
          tokenHash: hashSecret(token),
          invitedById: actor.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        },
        include: { invitedBy: { select: { fullName: true } } },
      });
      await this.audit.record(
        {
          action: AuditAction.MEMBER_INVITED,
          entityType: 'OrganizationInvitation',
          entityId: created.id,
          organizationId: ctx.organizationId,
          userId: actor.id,
          ipAddress: meta.ipAddress,
          details: { email: input.email, role: input.role },
        },
        tx,
      );
      return created;
    });

    const url = `${this.config.app.publicUrl}/invitations/accept?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: input.email,
      ...invitationEmail(
        ctx.organizationName,
        actor.fullName,
        ORG_ROLE_LABELS[input.role],
        url,
      ),
    });
    return toInvitationDto(invitation);
  }

  async revoke(
    ctx: OrganizationContext,
    invitationId: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    const { count } = await this.prisma.organizationInvitation.updateMany({
      where: {
        id: invitationId,
        organizationId: ctx.organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException('Invitation not found or no longer pending');
    }
    await this.audit.record({
      action: AuditAction.INVITATION_REVOKED,
      entityType: 'OrganizationInvitation',
      entityId: invitationId,
      organizationId: ctx.organizationId,
      userId: actor.id,
      ipAddress: meta.ipAddress,
    });
  }

  async preview(token: string): Promise<InvitationPreviewDto> {
    const invitation = await this.findValid(token);
    const hasAccount =
      (await this.prisma.user.count({ where: { email: invitation.email } })) >
      0;
    return {
      organizationName: invitation.organization.name,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      hasAccount,
    };
  }

  /**
   * Joins the organization with the signed-in account. Invitees without an account create one
   * with Supabase Auth first (confirming the invited mailbox), then accept.
   */
  async accept(
    input: AcceptInvitationInput,
    user: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<{ organizationId: string }> {
    const invitation = await this.findValid(input.token);
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address. Sign in with that address to accept it.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const alreadyMember = await tx.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
      });
      if (alreadyMember) {
        throw new ConflictException(
          'You are already a member of this organization',
        );
      }
      await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
        },
      });
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count !== 1) {
        throw new BadRequestException('This invitation has already been used');
      }
      await this.audit.record(
        {
          action: AuditAction.INVITATION_ACCEPTED,
          entityType: 'OrganizationInvitation',
          entityId: invitation.id,
          organizationId: invitation.organizationId,
          userId: user.id,
          ipAddress: meta.ipAddress,
        },
        tx,
      );
    });

    return { organizationId: invitation.organizationId };
  }

  private async findValid(token: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { organization: { select: { name: true } } },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date()
    ) {
      throw new NotFoundException('This invitation is invalid or has expired');
    }
    return invitation;
  }
}
