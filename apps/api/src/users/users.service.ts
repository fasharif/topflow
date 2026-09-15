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
  UpdateProfileInput,
  UserAdminDto,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import type { AuthenticatedUser, RequestMeta } from '../common/request-context';
import { isoOrNull, pageArgs, paginated } from '../common/serialization';
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
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<AuthUser> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: input.fullName, phoneNumber: input.phoneNumber },
    });
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: userId,
      userId,
      details: { fields: Object.keys(input) },
    });
    return this.auth.getAuthUser(userId);
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
        'An account with this email address already exists',
      );
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        role: input.role,
        passwordHash: await this.passwords.hash(input.password),
        emailVerifiedAt: new Date(),
      },
      include: userAdminInclude,
    });
    await this.audit.record({
      action: AuditAction.STAFF_CREATED,
      entityType: 'User',
      entityId: user.id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { role: user.role },
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
    const user = await this.prisma.user.update({
      where: { id },
      data: { role: input.role, isActive: input.isActive },
      include: userAdminInclude,
    });
    if (input.isActive === false || input.role !== undefined) {
      // Force re-authentication so the new role / suspension applies to every device.
      await this.tokens.revokeAllForUser(id);
    }
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
