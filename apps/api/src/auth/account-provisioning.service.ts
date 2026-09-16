import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@topflow/database';
import {
  ErrorCode,
  OrgRole,
  OrgStatus,
  nameSchema,
  organizationProfileSchema,
  phoneSchema,
  type OrganizationProfileInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenClaims } from './access-token.verifier';
import { IdentityAdminService } from './identity-admin.service';

const accountSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  lastSessionId: true,
} satisfies Prisma.UserSelect;

export type PlatformAccount = Prisma.UserGetPayload<{
  select: typeof accountSelect;
}>;

interface SignUpProfile {
  fullName?: string;
  phoneNumber?: string;
  organization?: OrganizationProfileInput;
}

/** Sign-up metadata is user-editable, so every field is validated on its own and ignored when invalid. */
function readSignUpProfile(metadata: Record<string, unknown>): SignUpProfile {
  const fullName = nameSchema.safeParse(metadata.full_name ?? metadata.name);
  const phoneNumber = phoneSchema.safeParse(metadata.phone_number);
  const organization = organizationProfileSchema.safeParse(
    metadata.organization,
  );
  return {
    fullName: fullName.success ? fullName.data : undefined,
    phoneNumber: phoneNumber.success ? phoneNumber.data : undefined,
    organization: organization.success ? organization.data : undefined,
  };
}

function nameFromEmail(email: string): string {
  const local = email
    .split('@')[0]
    .replace(/[._+-]+/g, ' ')
    .trim();
  return local.length >= 2 ? local.slice(0, 120) : 'Top Flow customer';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Links Supabase identities to platform accounts. The first authenticated request of a new
 * identity creates the account (with the same id) from the sign-up profile, including the
 * organization of a business sign-up. Later requests record each new session once and follow
 * email changes confirmed in Supabase.
 */
@Injectable()
export class AccountProvisioningService {
  private readonly logger = new Logger(AccountProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: IdentityAdminService,
    private readonly audit: AuditService,
  ) {}

  async resolve(
    claims: AccessTokenClaims,
    meta: RequestMeta,
  ): Promise<PlatformAccount> {
    const account =
      (await this.prisma.user.findUnique({
        where: { id: claims.userId },
        select: accountSelect,
      })) ?? (await this.provision(claims, meta));
    return this.recordSession(account, claims, meta);
  }

  /** Creates an organization, pending KYC review, owned by the account. Returns its id. */
  openTradeAccount(
    account: { id: string; email: string },
    profile: OrganizationProfileInput,
    meta: RequestMeta,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ...profile,
          email: profile.email ?? account.email,
          status: OrgStatus.PENDING_VERIFICATION,
          members: { create: { userId: account.id, role: OrgRole.OWNER } },
        },
      });
      await this.audit.record(
        {
          action: AuditAction.ORGANIZATION_REGISTERED,
          entityType: 'Organization',
          entityId: organization.id,
          organizationId: organization.id,
          userId: account.id,
          ipAddress: meta.ipAddress,
          details: {
            name: organization.name,
            tradeLicenseNumber: organization.tradeLicenseNumber,
          },
        },
        tx,
      );
      return organization.id;
    });
  }

  private async provision(
    claims: AccessTokenClaims,
    meta: RequestMeta,
  ): Promise<PlatformAccount> {
    // Prefer the authoritative identity (needs the secret key); fall back to the token claims.
    const identity = await this.identities.findIdentity(claims.userId);
    const email = identity?.email?.trim().toLowerCase() || claims.email;
    if (!email) {
      throw new UnauthorizedException(
        'Sign in with an email address to use Top Flow.',
      );
    }
    const profile = readSignUpProfile(
      identity?.userMetadata ?? claims.userMetadata,
    );
    const emailConfirmed = identity
      ? identity.emailConfirmed
      : claims.userMetadata.email_verified === true;

    let account: PlatformAccount;
    try {
      account = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            id: claims.userId,
            email,
            fullName: profile.fullName ?? nameFromEmail(email),
            phoneNumber: profile.phoneNumber,
            emailVerifiedAt: emailConfirmed ? new Date() : null,
          },
          select: accountSelect,
        });
        await this.audit.record(
          {
            action: AuditAction.USER_REGISTERED,
            entityType: 'User',
            entityId: created.id,
            userId: created.id,
            ipAddress: meta.ipAddress,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await this.prisma.user.findUnique({
        where: { id: claims.userId },
        select: accountSelect,
      });
      if (concurrent) return concurrent;
      this.logger.error(
        `Identity ${claims.userId} was not provisioned: ${email} already belongs to another platform account`,
      );
      throw new ConflictException({
        message:
          'This email address is linked to another Top Flow account. Please contact us.',
        code: ErrorCode.ACCOUNT_CONFLICT,
      });
    }

    if (profile.organization) {
      try {
        await this.openTradeAccount(account, profile.organization, meta);
      } catch (error) {
        // Never block sign-in; the owner can open the trade account again and see the reason.
        this.logger.warn(
          `Trade account from sign-up was not created for ${account.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return account;
  }

  private async recordSession(
    account: PlatformAccount,
    claims: AccessTokenClaims,
    meta: RequestMeta,
  ): Promise<PlatformAccount> {
    let current = account;

    if (claims.sessionId && claims.sessionId !== account.lastSessionId) {
      const now = new Date();
      const verified =
        !account.emailVerifiedAt &&
        ((await this.identities.findIdentity(account.id))?.emailConfirmed ??
          claims.userMetadata.email_verified === true);
      // Conditional update: parallel requests of the same new session record it exactly once.
      const { count } = await this.prisma.user.updateMany({
        where: {
          id: account.id,
          OR: [
            { lastSessionId: null },
            { lastSessionId: { not: claims.sessionId } },
          ],
        },
        data: {
          lastSessionId: claims.sessionId,
          lastLoginAt: now,
          ...(verified && { emailVerifiedAt: now }),
        },
      });
      current = {
        ...current,
        lastSessionId: claims.sessionId,
        ...(verified && { emailVerifiedAt: now }),
      };
      if (count === 1) {
        await this.audit.record({
          action: AuditAction.LOGIN,
          entityType: 'User',
          entityId: account.id,
          userId: account.id,
          ipAddress: meta.ipAddress,
          details: {
            assuranceLevel: claims.assuranceLevel,
            userAgent: meta.userAgent,
          },
        });
      }
    }

    if (claims.email && claims.email !== account.email) {
      // Supabase only changes an email after both addresses confirmed it.
      try {
        await this.prisma.user.update({
          where: { id: account.id },
          data: { email: claims.email },
        });
        current = { ...current, email: claims.email };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        this.logger.error(
          `Email change of ${account.id} to ${claims.email} conflicts with another platform account`,
        );
      }
    }

    return current;
  }
}
