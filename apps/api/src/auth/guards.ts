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
  ORGANIZATION_HEADER,
  OrgStatus,
  hasAllPermissions,
  hasOrgPermission,
  type OrgPermission,
  type Permission,
} from '@topflow/shared';
import {
  IS_PUBLIC_KEY,
  ORG_PERMISSION_KEY,
  PERMISSIONS_KEY,
} from '../common/decorators';
import type { AppRequest } from '../common/request-context';
import {
  UUID_PATTERN,
  resolveOrganizationContext,
} from '../organizations/organization-context';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

function bearerToken(request: AppRequest): string | null {
  const header = request.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Global guard #1 — authentication. Every route requires a valid access token unless it
 * is marked @Public(). The user is re-read from the database on each request so that
 * deactivation and password changes take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
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
      const payload = await this.tokens.verifyAccessToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          passwordChangedAt: true,
        },
      });
      if (!user || !user.isActive) {
        throw new UnauthorizedException(
          'This account is disabled or no longer exists',
        );
      }
      if (
        user.passwordChangedAt &&
        Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat
      ) {
        throw new UnauthorizedException(
          'Your password was changed. Please sign in again.',
        );
      }
      request.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      };
      return true;
    } catch (error) {
      if (isPublic) return true;
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Invalid or expired access token');
    }
  }
}

/** Global guard #2 — platform RBAC via @RequirePermissions(). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

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
