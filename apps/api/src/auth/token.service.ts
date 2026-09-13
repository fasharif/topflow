import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@topflow/database';
import type { Role, TokenPurpose } from '@topflow/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import type { RequestMeta } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
  iat: number;
  exp: number;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

const ISSUER = 'topflow-api';
const AUDIENCE = 'topflow-clients';
/** Two tabs refreshing at once is normal; a rotated token re-presented later is not. */
const ROTATION_GRACE_MS = 30_000;

/**
 * Token lifecycle:
 *  • Access tokens — short-lived HS256 JWTs (15 min default), verified statelessly.
 *  • Refresh tokens — 256-bit opaque secrets, stored only as SHA-256 hashes, rotated on
 *    every use. Presenting an already-rotated token outside the grace window is treated
 *    as theft: the whole token family (device session) is revoked.
 *  • One-time tokens — hashed, single-use, expiring links for email verification and
 *    password reset.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  static generateSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  static hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  signAccessToken(user: { id: string; role: Role }): IssuedToken {
    const ttl = this.config.auth.accessTokenTtlSeconds;
    const token = this.jwt.sign(
      { sub: user.id, role: user.role, typ: 'access' },
      {
        secret: this.config.auth.jwtSecret,
        expiresIn: ttl,
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithm: 'HS256',
      },
    );
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.auth.jwtSecret,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (payload.typ !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    return payload;
  }

  async issueRefreshToken(
    userId: string,
    meta: RequestMeta,
    familyId: string = randomUUID(),
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedToken> {
    const token = TokenService.generateSecret();
    const expiresAt = new Date(
      Date.now() + this.config.auth.refreshTokenTtlDays * 86_400_000,
    );
    await (tx ?? this.prisma).refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: TokenService.hash(token),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    return { token, expiresAt };
  }

  /** Exchanges a refresh token for a new one. Returns the owning user id. */
  async rotateRefreshToken(
    presented: string,
    meta: RequestMeta,
  ): Promise<IssuedToken & { userId: string }> {
    const now = new Date();
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hash(presented) },
    });

    if (!record || record.revokedAt || record.expiresAt <= now) {
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }

    if (record.rotatedAt) {
      if (now.getTime() - record.rotatedAt.getTime() > ROTATION_GRACE_MS) {
        await this.revokeFamily(record.familyId);
        this.logger.warn(
          `Refresh token reuse detected for user ${record.userId}; session family revoked`,
        );
        throw new UnauthorizedException(
          'Your session has expired. Please sign in again.',
        );
      }
    } else {
      // Compare-and-set so two concurrent rotations cannot both "win".
      await this.prisma.refreshToken.updateMany({
        where: { id: record.id, rotatedAt: null },
        data: { rotatedAt: now },
      });
    }

    const issued = await this.issueRefreshToken(
      record.userId,
      meta,
      record.familyId,
    );
    return { ...issued, userId: record.userId };
  }

  /** Logout: revokes the device session the token belongs to. Unknown tokens are ignored. */
  async revokeRefreshToken(presented: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hash(presented) },
    });
    if (record) {
      await this.revokeFamily(record.familyId);
    }
  }

  async revokeAllForUser(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Creates a single-use token and invalidates any earlier unused token for the same purpose. */
  async createOneTimeToken(
    userId: string,
    purpose: TokenPurpose,
    ttlMinutes: number,
  ): Promise<string> {
    const token = TokenService.generateSecret();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.oneTimeToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.oneTimeToken.create({
        data: {
          userId,
          purpose,
          tokenHash: TokenService.hash(token),
          expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
        },
      }),
    ]);
    return token;
  }

  /** Atomically consumes a one-time token and returns its user id. */
  async consumeOneTimeToken(
    token: string,
    purpose: TokenPurpose,
  ): Promise<string> {
    const now = new Date();
    const record = await this.prisma.oneTimeToken.findUnique({
      where: { tokenHash: TokenService.hash(token) },
    });
    const invalid = new BadRequestException(
      'This link is invalid or has expired. Please request a new one.',
    );
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt <= now
    ) {
      throw invalid;
    }
    const { count } = await this.prisma.oneTimeToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (count !== 1) {
      throw invalid;
    }
    return record.userId;
  }
}
