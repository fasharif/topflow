import type { Request } from 'express';
import type { OrgRole, OrgStatus, Role } from '@topflow/shared';

/** Identity attached to the request by JwtAuthGuard (always re-read from the database). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

/** B2B tenant context resolved by OrganizationGuard from the x-organization-id header. */
export interface OrganizationContext {
  organizationId: string;
  organizationName: string;
  organizationStatus: OrgStatus;
  /** Negotiated discount in percent, as a decimal string. */
  discountRate: string;
  memberId: string;
  role: OrgRole;
  approvalLimit: string | null;
}

export interface RequestMeta {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AppRequest extends Request {
  requestId?: string;
  user?: AuthenticatedUser;
  organization?: OrganizationContext;
}

export function requestMeta(request: AppRequest): RequestMeta {
  return {
    requestId: request.requestId ?? 'unknown',
    ipAddress: request.ip ?? null,
    userAgent: request.get('user-agent')?.slice(0, 300) ?? null,
  };
}
