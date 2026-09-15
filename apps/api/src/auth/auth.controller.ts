import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthSession, AuthUser } from '@topflow/shared';
import type { Response } from 'express';
import { CurrentUser, Meta, Public } from '../common/decorators';
import type {
  AppRequest,
  AuthenticatedUser,
  RequestMeta,
} from '../common/request-context';
import { strictThrottle } from '../common/throttle';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterBusinessDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';

/** Stricter per-IP limit for credential endpoints (brute force / credential stuffing). */
export const authThrottle = strictThrottle;

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionCookieService,
  ) {}

  @Public()
  @Throttle(authThrottle)
  @Post('register')
  @ApiOperation({ summary: 'Create a personal (retail) customer account' })
  async register(
    @Body() dto: RegisterDto,
    @Meta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sessions.respond(req, res, await this.auth.register(dto, meta));
  }

  @Public()
  @Throttle(authThrottle)
  @Post('register/business')
  @ApiOperation({
    summary:
      'Create a business account (user + organization pending verification)',
  })
  async registerBusiness(
    @Body() dto: RegisterBusinessDto,
    @Meta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sessions.respond(
      req,
      res,
      await this.auth.registerBusiness(dto, meta),
    );
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Meta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sessions.respond(req, res, await this.auth.login(dto, meta));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({
    summary:
      'Rotate the refresh token (httpOnly cookie for browsers, body for native apps)',
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Meta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const token = dto.refreshToken ?? this.sessions.read(req);
    if (!token) {
      throw new UnauthorizedException('No active session');
    }
    try {
      return this.sessions.respond(
        req,
        res,
        await this.auth.refresh(token, meta),
      );
    } catch (error) {
      this.sessions.clear(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken ?? this.sessions.read(req));
    this.sessions.clear(res);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  @ApiOperation({
    summary: 'Revoke every session of the current user on all devices',
  })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutEverywhere(user.id, meta);
    this.sessions.clear(res);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.getAuthUser(user.id);
  }

  @ApiBearerAuth()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/verification')
  @ApiOperation({ summary: 'Re-send the email verification link' })
  resendVerification(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.requestEmailVerification(user.id);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('email/verify')
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/forgot')
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.auth.forgotPassword(dto.email, meta);
  }

  @Public()
  @Throttle(authThrottle)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('password/reset')
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password, meta);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('password/change')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Meta() meta: RequestMeta,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    return this.sessions.respond(
      req,
      res,
      await this.auth.changePassword(user.id, dto, meta),
    );
  }
}
