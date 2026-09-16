import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ORGANIZATION_HEADER,
  OrgPermission,
  Permission,
  type AddressDto,
  type InvitationDto,
  type InvitationPreviewDto,
  type MemberDto,
  type OrganizationDto,
  type Paginated,
} from '@topflow/shared';
import {
  CurrentOrganization,
  CurrentUser,
  Meta,
  Public,
  RequireOrgPermission,
  RequirePermissions,
} from '../common/decorators';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import { strictThrottle } from '../common/throttle';
import { AddressBookService } from '../users/address-book.service';
import { CreateAddressDto, UpdateAddressDto } from '../users/users.dto';
import { InvitationsService } from './invitations.service';
import {
  AcceptInvitationDto,
  InvitationTokenDto,
  InviteMemberDto,
  OrganizationQueryDto,
  ReviewOrganizationDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from './organizations.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('B2B · Organization')
@ApiBearerAuth()
@ApiHeader({
  name: ORGANIZATION_HEADER,
  required: true,
  description: 'Organization (tenant) to act in',
})
@Controller('org')
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly addressBook: AddressBookService,
  ) {}

  @Get()
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  profile(
    @CurrentOrganization() org: OrganizationContext,
  ): Promise<OrganizationDto> {
    return this.organizations.getProfile(org);
  }

  @Patch()
  @RequireOrgPermission(OrgPermission.PROFILE_MANAGE)
  updateProfile(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<OrganizationDto> {
    return this.organizations.updateProfile(org, dto, user, meta);
  }

  @Get('members')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  members(
    @CurrentOrganization() org: OrganizationContext,
  ): Promise<MemberDto[]> {
    return this.organizations.listMembers(org.organizationId);
  }

  @Patch('members/:memberId')
  @RequireOrgPermission(OrgPermission.MEMBERS_MANAGE)
  @ApiOperation({
    summary: 'Change a member role or purchasing (approval) limit',
  })
  updateMember(
    @CurrentOrganization() org: OrganizationContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<MemberDto> {
    return this.organizations.updateMember(org, memberId, dto, user, meta);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrgPermission(OrgPermission.MEMBERS_MANAGE)
  removeMember(
    @CurrentOrganization() org: OrganizationContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.organizations.removeMember(org, memberId, user, meta);
  }

  @Get('invitations')
  @RequireOrgPermission(OrgPermission.MEMBERS_MANAGE)
  pendingInvitations(
    @CurrentOrganization() org: OrganizationContext,
  ): Promise<InvitationDto[]> {
    return this.invitations.listPending(org.organizationId);
  }

  @Post('invitations')
  @RequireOrgPermission(OrgPermission.MEMBERS_MANAGE)
  invite(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<InvitationDto> {
    return this.invitations.invite(org, dto, user, meta);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrgPermission(OrgPermission.MEMBERS_MANAGE)
  revokeInvitation(
    @CurrentOrganization() org: OrganizationContext,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.invitations.revoke(org, invitationId, user, meta);
  }

  @Get('addresses')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  sites(
    @CurrentOrganization() org: OrganizationContext,
  ): Promise<AddressDto[]> {
    return this.addressBook.list({ organizationId: org.organizationId });
  }

  @Post('addresses')
  @RequireOrgPermission(OrgPermission.SITES_MANAGE)
  createSite(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    return this.addressBook.create({ organizationId: org.organizationId }, dto);
  }

  @Patch('addresses/:id')
  @RequireOrgPermission(OrgPermission.SITES_MANAGE)
  updateSite(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addressBook.update(
      { organizationId: org.organizationId },
      id,
      dto,
    );
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireOrgPermission(OrgPermission.SITES_MANAGE)
  removeSite(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.addressBook.remove({ organizationId: org.organizationId }, id);
  }
}

@ApiTags('B2B · Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Throttle(strictThrottle)
  @HttpCode(HttpStatus.OK)
  @Post('preview')
  @ApiOperation({
    summary:
      'Show who invited you before accepting (token from the email link)',
  })
  preview(@Body() dto: InvitationTokenDto): Promise<InvitationPreviewDto> {
    return this.invitations.preview(dto.token);
  }

  @ApiBearerAuth()
  @Throttle(strictThrottle)
  @HttpCode(HttpStatus.OK)
  @Post('accept')
  @ApiOperation({
    summary:
      'Join the organization with the signed-in account (its email must match the invitation)',
  })
  accept(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<{ organizationId: string }> {
    return this.invitations.accept(dto, user, meta);
  }
}

@ApiTags('Admin · Organizations')
@ApiBearerAuth()
@RequirePermissions(Permission.ORGANIZATIONS_REVIEW)
@Controller('admin/organizations')
export class AdminOrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(
    @Query() query: OrganizationQueryDto,
  ): Promise<Paginated<OrganizationDto>> {
    return this.organizations.adminList(query);
  }

  @Get(':id')
  detail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ organization: OrganizationDto; members: MemberDto[] }> {
    return this.organizations.adminGet(id);
  }

  @Patch(':id/review')
  @ApiOperation({
    summary:
      'KYC decision and commercial terms (status, payment terms, credit limit, discount)',
  })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<OrganizationDto> {
    return this.organizations.review(id, dto, user, meta);
  }
}
