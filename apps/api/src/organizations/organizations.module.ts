import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { InvitationsService } from './invitations.service';
import {
  AdminOrganizationsController,
  InvitationsController,
  OrganizationController,
} from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [
    OrganizationController,
    InvitationsController,
    AdminOrganizationsController,
  ],
  providers: [OrganizationsService, InvitationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
