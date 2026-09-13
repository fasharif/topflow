import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, OrganizationGuard, PermissionsGuard } from './guards';
import { PasswordService } from './password.service';
import { SessionCookieService } from './session-cookie.service';
import { TokenService } from './token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    SessionCookieService,
    JwtAuthGuard,
    PermissionsGuard,
    OrganizationGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    PasswordService,
    SessionCookieService,
    JwtAuthGuard,
    PermissionsGuard,
    OrganizationGuard,
  ],
})
export class AuthModule {}
