import type { Request } from 'express';
import type { AssuranceLevel, OrgRole, OrgStatus, Role } from '@topflow/shared';

/** Identity attached to the request by AuthenticationGuard (the platform account is re-read each time). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Assurance level of the Supabase session that made the request. */
  assuranceLevel: AssuranceLevel;
  sessionId: string | null;
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
  /** The caller's address: the socket peer, or the shopper's address forwarded by the web app. */
  clientIp?: string | null;
  /** The request came from the web app's server (it presented INTERNAL_API_SECRET). */
  internalCaller?: boolean;
  /** clientIp is a shopper's address forwarded by the web app. */
  clientIpForwarded?: boolean;
  user?: AuthenticatedUser;
  organization?: OrganizationContext;
}

export function requestMeta(request: AppRequest): RequestMeta {
  return {
    requestId: request.requestId ?? 'unknown',
    ipAddress: request.clientIp ?? request.ip ?? null,
    userAgent: request.get('user-agent')?.slice(0, 300) ?? null,
  };
}
