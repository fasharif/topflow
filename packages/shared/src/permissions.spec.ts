import { OrgRole, Role } from './enums';
import {
  OrgPermission,
  Permission,
  hasOrgPermission,
  hasPermission,
  isStaffRole,
} from './permissions';

describe('platform permissions', () => {
  it('grants administrators every permission', () => {
    for (const permission of Object.values(Permission)) {
      expect(hasPermission(Role.ADMIN, permission)).toBe(true);
    }
  });

  it('grants customers no back-office permissions', () => {
    for (const permission of Object.values(Permission)) {
      expect(hasPermission(Role.CUSTOMER, permission)).toBe(false);
    }
  });

  it('separates sales and warehouse duties', () => {
    expect(hasPermission(Role.SALES, Permission.QUOTATIONS_MANAGE)).toBe(true);
    expect(hasPermission(Role.SALES, Permission.ORDERS_FULFIL)).toBe(false);
    expect(hasPermission(Role.WAREHOUSE, Permission.ORDERS_FULFIL)).toBe(true);
    expect(hasPermission(Role.WAREHOUSE, Permission.QUOTATIONS_MANAGE)).toBe(false);
    expect(hasPermission(Role.WAREHOUSE, Permission.CATALOG_DELETE)).toBe(false);
  });

  it('handles anonymous users', () => {
    expect(hasPermission(undefined, Permission.DASHBOARD_VIEW)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(Role.WAREHOUSE)).toBe(true);
  });
});

describe('organization permissions', () => {
  it('lets buyers request quotes but not approve purchases', () => {
    expect(hasOrgPermission(OrgRole.BUYER, OrgPermission.RFQ_CREATE)).toBe(true);
    expect(hasOrgPermission(OrgRole.BUYER, OrgPermission.PURCHASE_APPROVE)).toBe(false);
  });

  it('reserves team management for owners', () => {
    expect(hasOrgPermission(OrgRole.OWNER, OrgPermission.MEMBERS_MANAGE)).toBe(true);
    expect(hasOrgPermission(OrgRole.APPROVER, OrgPermission.MEMBERS_MANAGE)).toBe(false);
  });
});
