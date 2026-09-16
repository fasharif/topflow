import { Injectable } from '@nestjs/common';
import { ROLE_PERMISSIONS, isStaffRole, type AuthUser } from '@topflow/shared';
import type { AuthenticatedUser } from '../common/request-context';
import { moneyOrNull } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The platform view of the signed-in user. Signing in, sessions, passwords and MFA factors are
 * handled by Supabase Auth; the API contributes roles, permissions and organization memberships.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async getAuthUser(caller: AuthenticatedUser): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: caller.id },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      permissions: [...ROLE_PERMISSIONS[user.role]],
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationStatus: membership.organization.status,
        role: membership.role,
        approvalLimit: moneyOrNull(membership.approvalLimit),
      })),
      assuranceLevel: caller.assuranceLevel,
      mfaRequired: this.config.auth.staffMfaRequired && isStaffRole(user.role),
    };
  }
}
