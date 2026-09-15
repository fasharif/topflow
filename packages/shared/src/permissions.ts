/**
 * Role-based access control matrix — the single source of truth used by the API
 * guards and by the web/mobile clients to decide what to render.
 *
 * Two layers:
 *  • Platform permissions come from User.role (Top Flow staff and customers).
 *  • Organization permissions come from OrganizationMember.role inside a B2B tenant.
 *
 * The prototype checked `email == "admin" && password == "admin"` on the device;
 * here every privileged endpoint is enforced server-side against this matrix.
 */
import { OrgRole, Role } from './enums';

export const Permission = {
  DASHBOARD_VIEW: 'dashboard:view',
  CATALOG_WRITE: 'catalog:write',
  CATALOG_DELETE: 'catalog:delete',
  STOCK_WRITE: 'stock:write',
  ORDERS_READ_ALL: 'orders:read-all',
  ORDERS_MANAGE: 'orders:manage',
  ORDERS_FULFIL: 'orders:fulfil',
  RFQS_MANAGE: 'rfqs:manage',
  QUOTATIONS_MANAGE: 'quotations:manage',
  ORGANIZATIONS_REVIEW: 'organizations:review',
  USERS_MANAGE: 'users:manage',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL_PERMISSIONS = Object.values(Permission);

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  CUSTOMER: [],
  SALES: [
    Permission.DASHBOARD_VIEW,
    Permission.ORDERS_READ_ALL,
    Permission.ORDERS_MANAGE,
    Permission.RFQS_MANAGE,
    Permission.QUOTATIONS_MANAGE,
    Permission.ORGANIZATIONS_REVIEW,
  ],
  WAREHOUSE: [
    Permission.DASHBOARD_VIEW,
    Permission.CATALOG_WRITE,
    Permission.STOCK_WRITE,
    Permission.ORDERS_READ_ALL,
    Permission.ORDERS_FULFIL,
  ],
  ADMIN: ALL_PERMISSIONS,
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAllPermissions(role: Role | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function isStaffRole(role: Role | null | undefined): boolean {
  return !!role && role !== Role.CUSTOMER;
}

export const OrgPermission = {
  ORDERS_VIEW: 'org:orders:view',
  RFQ_CREATE: 'org:rfq:create',
  QUOTE_RESPOND: 'org:quote:respond',
  PURCHASE_APPROVE: 'org:purchase:approve',
  SITES_MANAGE: 'org:sites:manage',
  MEMBERS_MANAGE: 'org:members:manage',
  PROFILE_MANAGE: 'org:profile:manage',
} as const;
export type OrgPermission = (typeof OrgPermission)[keyof typeof OrgPermission];

export const ORG_ROLE_PERMISSIONS: Readonly<Record<OrgRole, readonly OrgPermission[]>> = {
  BUYER: [OrgPermission.ORDERS_VIEW, OrgPermission.RFQ_CREATE, OrgPermission.QUOTE_RESPOND],
  APPROVER: [
    OrgPermission.ORDERS_VIEW,
    OrgPermission.RFQ_CREATE,
    OrgPermission.QUOTE_RESPOND,
    OrgPermission.PURCHASE_APPROVE,
    OrgPermission.SITES_MANAGE,
  ],
  OWNER: Object.values(OrgPermission),
};

export function hasOrgPermission(role: OrgRole | null | undefined, permission: OrgPermission): boolean {
  return !!role && ORG_ROLE_PERMISSIONS[role].includes(permission);
}
