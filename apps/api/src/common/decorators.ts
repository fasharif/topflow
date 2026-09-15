import {
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { OrgPermission, Permission } from '@topflow/shared';
import {
  requestMeta,
  type AppRequest,
  type AuthenticatedUser,
  type OrganizationContext,
  type RequestMeta,
} from './request-context';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ORG_PERMISSION_KEY = 'auth:orgPermission';

/** Route is reachable without a token (a valid token is still decoded if present). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Caller's platform role must grant every listed permission (see @topflow/shared ROLE_PERMISSIONS). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Route runs inside a B2B tenant: the caller must be a member of the organization named
 * in the x-organization-id header and their org role must grant `permission`.
 */
export const RequireOrgPermission = (permission: OrgPermission) =>
  SetMetadata(ORG_PERMISSION_KEY, permission);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    if (!request.user) {
      throw new UnauthorizedException();
    }
    return request.user;
  },
);

/** Like CurrentUser but returns undefined on public routes called anonymously. */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined =>
    ctx.switchToHttp().getRequest<AppRequest>().user,
);

export const CurrentOrganization = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): OrganizationContext => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    if (!request.organization) {
      throw new Error(
        'CurrentOrganization used on a route without @RequireOrgPermission',
      );
    }
    return request.organization;
  },
);

export const Meta = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestMeta =>
    requestMeta(ctx.switchToHttp().getRequest<AppRequest>()),
);
