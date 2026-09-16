import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgPermission, Permission } from '@topflow/shared';
import {
  IS_PUBLIC_KEY,
  ORG_PERMISSION_KEY,
  PERMISSIONS_KEY,
} from '../common/decorators';
import { loadConfig } from '../config/env';
import type {
  AccessTokenClaims,
  AccessTokenVerifier,
} from './access-token.verifier';
import type {
  AccountProvisioningService,
  PlatformAccount,
} from './account-provisioning.service';
import {
  AuthenticationGuard,
  OrganizationGuard,
  PermissionsGuard,
} from './guards';

const ORG_ID = '7a1d1c6e-6f7b-4f8e-9b62-3e1a2b3c4d5e';

const config = (staffMfaRequired = false) =>
  loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test',
    STAFF_MFA_REQUIRED: String(staffMfaRequired),
  });

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

function responseOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return (error as HttpException).getResponse();
  }
  throw new Error('Expected the guard to throw');
}

describe('AuthenticationGuard', () => {
  const claims: AccessTokenClaims = {
    userId: 'user-1',
    email: 'jane@oasis.ae',
    assuranceLevel: 'aal1',
    sessionId: 'session-1',
    userMetadata: {},
  };
  const account: PlatformAccount = {
    id: 'user-1',
    email: 'jane@oasis.ae',
    fullName: 'Jane Doe',
    role: 'CUSTOMER',
    isActive: true,
    emailVerifiedAt: null,
    lastSessionId: 'session-1',
  };

  function guardWith(options: {
    headers?: Record<string, string>;
    isPublic?: boolean;
    verify?: () => Promise<AccessTokenClaims>;
    resolve?: () => Promise<PlatformAccount>;
  }) {
    const verifier = {
      verify: jest.fn(options.verify ?? (() => Promise.resolve(claims))),
    } as unknown as AccessTokenVerifier;
    const accounts = {
      resolve: jest.fn(options.resolve ?? (() => Promise.resolve(account))),
    } as unknown as AccountProvisioningService;
    const req = request(
      undefined,
      options.headers ?? { authorization: 'Bearer token' },
    );
    const { reflector, context } = httpContext(req, {
      [IS_PUBLIC_KEY]: options.isPublic ?? false,
    });
    return {
      guard: new AuthenticationGuard(reflector, verifier, accounts),
      context,
      req,
    };
  }

  it('requires a bearer token on protected routes', async () => {
    const { guard, context } = guardWith({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lets anonymous visitors through public routes', async () => {
    const { guard, context, req } = guardWith({ headers: {}, isPublic: true });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('attaches the platform account with the session assurance level', async () => {
    const { guard, context, req } = guardWith({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'jane@oasis.ae',
      fullName: 'Jane Doe',
      role: 'CUSTOMER',
      assuranceLevel: 'aal1',
      sessionId: 'session-1',
    });
  });

  it('rejects suspended accounts with a machine-readable code', async () => {
    const { guard, context } = guardWith({
      resolve: () => Promise.resolve({ ...account, isActive: false }),
    });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
  });

  it('treats an unusable token on a public route as anonymous', async () => {
    const { guard, context, req } = guardWith({
      isPublic: true,
      verify: () => Promise.reject(new UnauthorizedException()),
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });
});

describe('PermissionsGuard', () => {
  it('allows routes without permission metadata', () => {
    const { reflector, context } = httpContext(request(undefined), {});
    expect(new PermissionsGuard(reflector, config()).canActivate(context)).toBe(
      true,
    );
  });

  it('allows a role that holds every required permission', () => {
    const { reflector, context } = httpContext(
      request({ role: 'SALES', assuranceLevel: 'aal1' }),
      { [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE] },
    );
    expect(new PermissionsGuard(reflector, config()).canActivate(context)).toBe(
      true,
    );
  });

  it('forbids a role that lacks a permission', () => {
    const { reflector, context } = httpContext(
      request({ role: 'WAREHOUSE', assuranceLevel: 'aal2' }),
      { [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE] },
    );
    expect(() =>
      new PermissionsGuard(reflector, config()).canActivate(context),
    ).toThrow(ForbiddenException);
  });

  it('requires authentication for protected routes', () => {
    const { reflector, context } = httpContext(request(undefined), {
      [PERMISSIONS_KEY]: [Permission.DASHBOARD_VIEW],
    });
    expect(() =>
      new PermissionsGuard(reflector, config()).canActivate(context),
    ).toThrow(UnauthorizedException);
  });

  it('requires a verified second factor for staff when MFA is enforced', () => {
    const unverified = httpContext(
      request({ role: 'SALES', assuranceLevel: 'aal1' }),
      { [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE] },
    );
    expect(
      responseOf(() =>
        new PermissionsGuard(unverified.reflector, config(true)).canActivate(
          unverified.context,
        ),
      ),
    ).toMatchObject({ code: 'MFA_REQUIRED' });

    const verified = httpContext(
      request({ role: 'SALES', assuranceLevel: 'aal2' }),
      { [PERMISSIONS_KEY]: [Permission.QUOTATIONS_MANAGE] },
    );
    expect(
      new PermissionsGuard(verified.reflector, config(true)).canActivate(
        verified.context,
      ),
    ).toBe(true);
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
