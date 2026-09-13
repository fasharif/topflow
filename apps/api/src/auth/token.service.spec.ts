import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { loadConfig } from '../config/env';
import { TokenService } from './token.service';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test',
});
const meta = { requestId: 'req-1', ipAddress: '127.0.0.1', userAgent: 'jest' };
const inOneMinute = () => new Date(Date.now() + 60_000);

function mockPrisma() {
  return {
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oneTimeToken: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  };
}

describe('TokenService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: TokenService;

  beforeEach(() => {
    prisma = mockPrisma();
    service = new TokenService(prisma as never, new JwtService({}), config);
  });

  describe('access tokens', () => {
    it('signs and verifies short-lived tokens', async () => {
      const { token, expiresAt } = service.signAccessToken({
        id: 'user-1',
        role: 'CUSTOMER',
      });
      const payload = await service.verifyAccessToken(token);
      expect(payload).toMatchObject({
        sub: 'user-1',
        role: 'CUSTOMER',
        typ: 'access',
      });
      expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(
        config.auth.accessTokenTtlSeconds * 1000,
      );
    });

    it('rejects tokens signed with a different secret', async () => {
      const forged = new JwtService({}).sign(
        { sub: 'user-1', role: 'ADMIN', typ: 'access' },
        {
          secret: 'attacker-secret-attacker-secret-0000',
          issuer: 'topflow-api',
          audience: 'topflow-clients',
        },
      );
      await expect(service.verifyAccessToken(forged)).rejects.toThrow();
    });
  });

  describe('refresh tokens', () => {
    it('persists only a SHA-256 hash of the secret', async () => {
      const { token } = await service.issueRefreshToken('user-1', meta);
      const stored = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(stored.tokenHash).toBe(TokenService.hash(token));
      expect(JSON.stringify(stored)).not.toContain(token);
    });

    it('rotates a valid token within the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'fam-1',
        rotatedAt: null,
        revokedAt: null,
        expiresAt: inOneMinute(),
      });

      const rotated = await service.rotateRefreshToken('presented-token', meta);

      expect(rotated.userId).toBe('user-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', rotatedAt: null },
        data: { rotatedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe(
        'fam-1',
      );
    });

    it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'fam-1',
        rotatedAt: new Date(Date.now() - 120_000),
        revokedAt: null,
        expiresAt: inOneMinute(),
      });

      await expect(
        service.rotateRefreshToken('stolen-token', meta),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('tolerates concurrent refreshes inside the grace window', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'fam-1',
        rotatedAt: new Date(Date.now() - 5_000),
        revokedAt: null,
        expiresAt: inOneMinute(),
      });

      await expect(
        service.rotateRefreshToken('racing-tab-token', meta),
      ).resolves.toMatchObject({ userId: 'user-1' });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['unknown', null],
      ['revoked', { revokedAt: new Date(), expiresAt: inOneMinute() }],
      ['expired', { revokedAt: null, expiresAt: new Date(Date.now() - 1000) }],
    ])('rejects %s tokens', async (_label, record) => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        record && {
          id: 'rt-1',
          userId: 'user-1',
          familyId: 'fam-1',
          rotatedAt: null,
          ...record,
        },
      );
      await expect(service.rotateRefreshToken('token', meta)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('one-time tokens', () => {
    const record = {
      id: 'ot-1',
      userId: 'user-1',
      purpose: 'PASSWORD_RESET',
      consumedAt: null,
      expiresAt: inOneMinute(),
    };

    it('invalidates earlier tokens for the same purpose when issuing a new one', async () => {
      await service.createOneTimeToken('user-1', 'PASSWORD_RESET', 60);
      expect(prisma.oneTimeToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          purpose: 'PASSWORD_RESET',
          consumedAt: null,
        },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('can be consumed exactly once', async () => {
      prisma.oneTimeToken.findUnique.mockResolvedValue(record);
      await expect(
        service.consumeOneTimeToken('token', 'PASSWORD_RESET'),
      ).resolves.toBe('user-1');

      prisma.oneTimeToken.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.consumeOneTimeToken('token', 'PASSWORD_RESET'),
      ).rejects.toThrow(BadRequestException);
    });

    it('cannot be used for a different purpose', async () => {
      prisma.oneTimeToken.findUnique.mockResolvedValue(record);
      await expect(
        service.consumeOneTimeToken('token', 'EMAIL_VERIFICATION'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
