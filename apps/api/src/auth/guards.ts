import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ErrorCode,
  ORGANIZATION_HEADER,
  OrgStatus,
  hasAllPermissions,
  hasOrgPermission,
  isStaffRole,
  type OrgPermission,
  type Permission,
} from '@topflow/shared';
import {
  IS_PUBLIC_KEY,
  ORG_PERMISSION_KEY,
  PERMISSIONS_KEY,
} from '../common/decorators';
import { requestMeta, type AppRequest } from '../common/request-context';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import {
  UUID_PATTERN,
  resolveOrganizationContext,
} from '../organizations/organization-context';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenVerifier } from './access-token.verifier';
import { AccountProvisioningService } from './account-provisioning.service';

function bearerToken(request: AppRequest): string | null {
  const header = request.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Global guard #1 — authentication. Every route requires a Supabase access token unless it is
 * marked @Public() (a valid token on a public route still identifies the caller). The platform
 * account is re-read on every request, so role changes and suspensions apply immediately.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
    private readonly accounts: AccountProvisioningService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AppRequest>();
    const token = bearerToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const claims = await this.verifier.verify(token);
      const account = await this.accounts.resolve(claims, requestMeta(request));
      if (!account.isActive) {
        throw new UnauthorizedException({
          message: 'This account has been disabled. Please contact Top Flow.',
          code: ErrorCode.ACCOUNT_DISABLED,
        });
      }
      request.user = {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        role: account.role,
        assuranceLevel: claims.assuranceLevel,
        sessionId: claims.sessionId,
      };
      return true;
    } catch (error) {
      // Public routes stay available to callers whose token cannot be used.
      if (isPublic) return true;
      throw error;
    }
  }
}

/**
 * Global guard #2 — platform RBAC via @RequirePermissions(). When STAFF_MFA_REQUIRED is on,
 * back-office permissions also need a session verified with a second factor (aal2).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<AppRequest>();
    if (!user) throw new UnauthorizedException('Authentication required');
    if (!hasAllPermissions(user.role, required)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
    if (
      this.config.auth.staffMfaRequired &&
      isStaffRole(user.role) &&
      user.assuranceLevel !== 'aal2'
    ) {
      throw new ForbiddenException({
        message:
          'Verify your identity with two-factor authentication to use the back office.',
        code: ErrorCode.MFA_REQUIRED,
      });
    }
    return true;
  }
}

/**
 * Global guard #3 — multi-tenancy. Routes decorated with @RequireOrgPermission() run inside
 * the organization named by the x-organization-id header. Membership is verified server-side
 * and the resolved tenant is attached to the request; services never trust an organization
 * id supplied in a request body.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<
      OrgPermission | undefined
    >(ORG_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!request.user)
      throw new UnauthorizedException('Authentication required');

    const organizationId = request.get(ORGANIZATION_HEADER);
    if (!organizationId || !UUID_PATTERN.test(organizationId)) {
      throw new BadRequestException(
        `Select an organization first (missing or invalid ${ORGANIZATION_HEADER} header)`,
      );
    }

    const organization = await resolveOrganizationContext(
      this.prisma,
      request.user.id,
      organizationId,
    );
    if (!organization) {
      throw new ForbiddenException('You are not a member of this organization');
    }
    if (organization.organizationStatus === OrgStatus.SUSPENDED) {
      throw new ForbiddenException(
        'This organization account is suspended. Please contact Top Flow.',
      );
    }
    if (!hasOrgPermission(organization.role, permission)) {
      throw new ForbiddenException(
        'Your role in this organization does not allow this action',
      );
    }

    request.organization = organization;
    return true;
  }
}
