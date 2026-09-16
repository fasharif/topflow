import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import type {
  AdminUpdateUserInput,
  AdminUserQuery,
  AuthUser,
  CreateStaffUserInput,
  Paginated,
  RegisterOrganizationInput,
  UpdateProfileInput,
  UserAdminDto,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AccountProvisioningService } from '../auth/account-provisioning.service';
import { AuthService } from '../auth/auth.service';
import { IdentityAdminService } from '../auth/identity-admin.service';
import type { AuthenticatedUser, RequestMeta } from '../common/request-context';
import { isoOrNull, pageArgs, paginated } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const userAdminInclude = {
  memberships: {
    include: { organization: { select: { id: true, name: true } } },
  },
} satisfies Prisma.UserInclude;

type UserWithMemberships = Prisma.UserGetPayload<{
  include: typeof userAdminInclude;
}>;

function toUserAdminDto(user: UserWithMemberships): UserAdminDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerifiedAt !== null,
    lastLoginAt: isoOrNull(user.lastLoginAt),
    createdAt: user.createdAt.toISOString(),
    organizations: user.memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
    })),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly identities: IdentityAdminService,
    private readonly accounts: AccountProvisioningService,
    private readonly audit: AuditService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async updateProfile(
    user: AuthenticatedUser,
    input: UpdateProfileInput,
  ): Promise<AuthUser> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { fullName: input.fullName, phoneNumber: input.phoneNumber },
    });
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      details: { fields: Object.keys(input) },
    });
    return this.auth.getAuthUser(user);
  }

  /** Opens a trade account (an organization pending KYC review) for the signed-in user. */
  async openTradeAccount(
    user: AuthenticatedUser,
    input: RegisterOrganizationInput,
    meta: RequestMeta,
  ): Promise<AuthUser> {
    await this.accounts.openTradeAccount(user, input, meta);
    return this.auth.getAuthUser(user);
  }

  async list(query: AdminUserQuery): Promise<Paginated<UserAdminDto>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role && { role: query.role }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: userAdminInclude,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(users.map(toUserAdminDto), total, query);
  }

  /**
   * Invites a colleague through Supabase Auth. They receive an email, choose their own password
   * and land in the back office with the assigned role; no administrator handles a password.
   */
  async createStaff(
    input: CreateStaffUserInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<UserAdminDto> {
    if (
      await this.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'An account with this email address already exists. Change its role from the user list instead.',
      );
    }

    const id = await this.identities.inviteStaff({
      email: input.email,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      redirectTo: `${this.config.app.publicUrl}/auth/set-password`,
    });

    let user: UserWithMemberships;
    try {
      user = await this.prisma.user.create({
        data: {
          id,
          email: input.email,
          fullName: input.fullName,
          phoneNumber: input.phoneNumber,
          role: input.role,
        },
        include: userAdminInclude,
      });
    } catch (error) {
      await this.identities.deleteIdentity(id);
      throw error;
    }

    await this.audit.record({
      action: AuditAction.STAFF_CREATED,
      entityType: 'User',
      entityId: user.id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { role: user.role, invited: true },
    });
    return toUserAdminDto(user);
  }

  async adminUpdate(
    id: string,
    input: AdminUpdateUserInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<UserAdminDto> {
    if (
      id === actor.id &&
      ((input.role !== undefined && input.role !== actor.role) ||
        input.isActive === false)
    ) {
      throw new BadRequestException(
        'You cannot change your own role or deactivate your own account',
      );
    }
    // Suspend or restore sign-in in Supabase first, so a failure leaves the account unchanged.
    // Role changes need no sign-out: the API reloads the role on every request.
    if (input.isActive !== undefined) {
      await this.identities.setSuspended(id, !input.isActive);
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { role: input.role, isActive: input.isActive },
      include: userAdminInclude,
    });
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { ...input },
    });
    return toUserAdminDto(user);
  }
}
