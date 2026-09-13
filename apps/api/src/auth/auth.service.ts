import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrgRole,
  OrgStatus,
  ROLE_PERMISSIONS,
  TokenPurpose,
  type AuthSession,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterBusinessInput,
  type RegisterInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { RequestMeta } from '../common/request-context';
import { moneyOrNull } from '../common/serialization';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const VERIFICATION_TTL_MINUTES = 60 * 24;
const RESET_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  async register(
    input: RegisterInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    await this.assertEmailAvailable(input.email);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        passwordHash: await this.passwords.hash(input.password),
      },
    });
    await this.audit.record({
      action: AuditAction.USER_REGISTERED,
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      ipAddress: meta.ipAddress,
    });
    await this.sendVerification(user.id, user.email, user.fullName);
    return this.startSession(user.id, meta);
  }

  /** Creates the user, a PENDING_VERIFICATION organization and the OWNER membership atomically. */
  async registerBusiness(
    input: RegisterBusinessInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    await this.assertEmailAvailable(input.email);
    const passwordHash = await this.passwords.hash(input.password);

    const { user, organization } = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            phoneNumber: input.phoneNumber,
            passwordHash,
          },
        });
        const organization = await tx.organization.create({
          data: {
            ...input.organization,
            email: input.organization.email ?? input.email,
            status: OrgStatus.PENDING_VERIFICATION,
            members: { create: { userId: user.id, role: OrgRole.OWNER } },
          },
        });
        await this.audit.record(
          {
            action: AuditAction.ORGANIZATION_REGISTERED,
            entityType: 'Organization',
            entityId: organization.id,
            organizationId: organization.id,
            userId: user.id,
            ipAddress: meta.ipAddress,
            details: {
              name: organization.name,
              tradeLicenseNumber: organization.tradeLicenseNumber,
            },
          },
          tx,
        );
        return { user, organization };
      },
    );

    this.logger.log(
      `Business account registered: ${organization.name} (${organization.id})`,
    );
    await this.sendVerification(user.id, user.email, user.fullName);
    return this.startSession(user.id, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    const valid = await this.passwords.verify(
      input.password,
      user?.passwordHash,
    );

    if (!user || !valid) {
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        entityType: 'User',
        entityId: user?.id,
        userId: user?.id,
        ipAddress: meta.ipAddress,
        details: { email: input.email },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.isActive) {
      throw new UnauthorizedException(
        'This account has been disabled. Please contact Top Flow.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      ipAddress: meta.ipAddress,
    });
    return this.startSession(user.id, meta);
  }

  async refresh(
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken, meta);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      await this.tokens.revokeAllForUser(rotated.userId);
      throw new UnauthorizedException('This account has been disabled');
    }
    return this.buildSession(rotated.userId, rotated.token, rotated.expiresAt);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return refreshToken
      ? this.tokens.revokeRefreshToken(refreshToken)
      : Promise.resolve();
  }

  async logoutEverywhere(userId: string, meta: RequestMeta): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
    await this.audit.record({
      action: AuditAction.LOGOUT_ALL,
      entityType: 'User',
      entityId: userId,
      userId,
      ipAddress: meta.ipAddress,
    });
  }

  async requestEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.emailVerifiedAt) {
      await this.sendVerification(user.id, user.email, user.fullName);
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.consumeOneTimeToken(
      token,
      TokenPurpose.EMAIL_VERIFICATION,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.EMAIL_VERIFIED,
      entityType: 'User',
      entityId: userId,
      userId,
    });
  }

  /** Always succeeds so the endpoint cannot be used to discover registered emails. */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) return;

    const token = await this.tokens.createOneTimeToken(
      user.id,
      TokenPurpose.PASSWORD_RESET,
      RESET_TTL_MINUTES,
    );
    const url = `${this.config.app.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: user.email,
      ...passwordResetEmail(user.fullName, url, RESET_TTL_MINUTES),
    });
    await this.audit.record({
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      ipAddress: meta.ipAddress,
    });
  }

  async resetPassword(
    token: string,
    password: string,
    meta: RequestMeta,
  ): Promise<void> {
    const userId = await this.tokens.consumeOneTimeToken(
      token,
      TokenPurpose.PASSWORD_RESET,
    );
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        // Following a reset link proves ownership of the mailbox.
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      await this.tokens.revokeAllForUser(userId, tx);
    });
    await this.audit.record({
      action: AuditAction.PASSWORD_RESET,
      entityType: 'User',
      entityId: userId,
      userId,
      ipAddress: meta.ipAddress,
    });
  }

  /** Changes the password, signs out every other device and returns a fresh session. */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (
      !(await this.passwords.verify(input.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Your current password is incorrect');
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await this.tokens.revokeAllForUser(userId, tx);
    });
    await this.audit.record({
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: userId,
      userId,
      ipAddress: meta.ipAddress,
    });
    return this.startSession(userId, meta);
  }

  async getAuthUser(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, name: true, status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      permissions: [...ROLE_PERMISSIONS[user.role]],
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationStatus: membership.organization.status,
        role: membership.role,
        approvalLimit: moneyOrNull(membership.approvalLimit),
      })),
    };
  }

  /** Issues a brand-new device session (refresh token family + access token). */
  async startSession(
    userId: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const refresh = await this.tokens.issueRefreshToken(userId, meta);
    return this.buildSession(userId, refresh.token, refresh.expiresAt);
  }

  private async buildSession(
    userId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<IssuedSession> {
    const user = await this.getAuthUser(userId);
    const access = this.tokens.signAccessToken(user);
    return {
      session: {
        user,
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    if (
      await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    ) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }
  }

  private async sendVerification(
    userId: string,
    email: string,
    fullName: string,
  ): Promise<void> {
    try {
      const token = await this.tokens.createOneTimeToken(
        userId,
        TokenPurpose.EMAIL_VERIFICATION,
        VERIFICATION_TTL_MINUTES,
      );
      const url = `${this.config.app.publicUrl}/verify-email?token=${encodeURIComponent(token)}`;
      await this.mail.send({ to: email, ...verificationEmail(fullName, url) });
    } catch (error) {
      // Registration must not fail because the mail provider is unavailable.
      this.logger.error(
        `Could not send verification email to ${email}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
