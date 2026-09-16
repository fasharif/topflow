import { Module } from '@nestjs/common';
import {
  AccessTokenVerifier,
  signingKeysProvider,
} from './access-token.verifier';
import { AccountProvisioningService } from './account-provisioning.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  AuthenticationGuard,
  OrganizationGuard,
  PermissionsGuard,
} from './guards';
import { IdentityAdminService } from './identity-admin.service';

/** Identity: Supabase Auth token verification, account provisioning and authorization guards. */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenVerifier,
    signingKeysProvider,
    IdentityAdminService,
    AccountProvisioningService,
    AuthenticationGuard,
    PermissionsGuard,
    OrganizationGuard,
  ],
  exports: [
    AuthService,
    IdentityAdminService,
    AccountProvisioningService,
    AuthenticationGuard,
    PermissionsGuard,
    OrganizationGuard,
  ],
})
export class AuthModule {}
