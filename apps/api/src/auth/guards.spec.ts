import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgPermission, Permission } from '@topflow/shared';
import { ORG_PERMISSION_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { OrganizationGuard, PermissionsGuard } from './guards';

const ORG_ID = '7a1d1c6e-6f7b-4f8e-9b62-3e1a2b3c4d5e';

function httpContext(
  request: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string]);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

function request(user: unknown, headers: Record<string, string> = {}) {
  return { user, get: (name: string) => headers[name.toLowerCase()] } as Record<
    string,
    unknown
  >;
}

describe('PermissionsGuard', () => {
  it('allows routes without permission metadata', () => {
    const { reflector, context } = httpContext(request(undefined), {});
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('allows a role that holds every required permission', () => {
    const { reflector, context } = httpContext(request({ role: 'SALES' }), {
      [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE],
    });
    expect(new PermissionsGuard(reflector).canActivate(context)).toBe(true);
  });

  it('forbids a role that lacks a permission', () => {
    const { reflector, context } = httpContext(request({ role: 'WAREHOUSE' }), {
      [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE],
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('requires authentication for protected routes', () => {
    const { reflector, context } = httpContext(request(undefined), {
      [PERMISSIONS_KEY]: [Permission.DASHBOARD_VIEW],
    });
    expect(() => new PermissionsGuard(reflector).canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });
});

describe('OrganizationGuard', () => {
  const user = { id: 'user-1', role: 'CUSTOMER' };
  const membership = (role: string, status = 'ACTIVE') => ({
    id: 'member-1',
    role,
    approvalLimit: null,
    organization: {
      name: 'Desert Bloom',
      status,
      discountRate: { toString: () => '7.5' },
    },
  });

  function guardWith(
    member: unknown,
    headers: Record<string, string>,
    permission: string = OrgPermission.RFQ_CREATE,
  ) {
    const prisma = {
      organizationMember: { findUnique: jest.fn().mockResolvedValue(member) },
    };
    const req = request(user, headers);
    const { reflector, context } = httpContext(req, {
      [ORG_PERMISSION_KEY]: permission,
    });
    return {
      guard: new OrganizationGuard(reflector, prisma as never),
      context,
      req,
      prisma,
    };
  }

  it('requires the organization header', async () => {
    const { guard, context } = guardWith(membership('BUYER'), {});
    await expect(guard.canActivate(context)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects users who are not members of the organization', async () => {
    const { guard, context } = guardWith(null, { 'x-organization-id': ORG_ID });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks suspended organizations', async () => {
    const { guard, context } = guardWith(membership('OWNER', 'SUSPENDED'), {
      'x-organization-id': ORG_ID,
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('enforces the organization role', async () => {
    const { guard, context } = guardWith(
      membership('BUYER'),
      { 'x-organization-id': ORG_ID },
      OrgPermission.MEMBERS_MANAGE,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('attaches the verified tenant context to the request', async () => {
    const { guard, context, req, prisma } = guardWith(
      membership('APPROVER'),
      { 'x-organization-id': ORG_ID },
      OrgPermission.PURCHASE_APPROVE,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.organizationMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId: { organizationId: ORG_ID, userId: 'user-1' },
        },
      }),
    );
    expect(req.organization).toMatchObject({
      organizationId: ORG_ID,
      role: 'APPROVER',
      discountRate: '7.50',
    });
  });
});
