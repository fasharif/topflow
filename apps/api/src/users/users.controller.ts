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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  type AddressDto,
  type AuthUser,
  type Paginated,
  type UserAdminDto,
} from '@topflow/shared';
import { CurrentUser, Meta, RequirePermissions } from '../common/decorators';
import type { AuthenticatedUser, RequestMeta } from '../common/request-context';
import { AddressBookService } from './address-book.service';
import {
  AdminUpdateUserDto,
  AdminUserQueryDto,
  CreateAddressDto,
  CreateStaffUserDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Account')
@ApiBearerAuth()
@Controller('me')
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly addressBook: AddressBookService,
  ) {}

  @Patch()
  @ApiOperation({ summary: 'Update the signed-in user profile' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUser> {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthenticatedUser): Promise<AddressDto[]> {
    return this.addressBook.list({ userId: user.id });
  }

  @Post('addresses')
  createAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    return this.addressBook.create({ userId: user.id }, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addressBook.update({ userId: user.id }, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.addressBook.remove({ userId: user.id }, id);
  }
}

@ApiTags('Admin · Users')
@ApiBearerAuth()
@RequirePermissions(Permission.USERS_MANAGE)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: AdminUserQueryDto): Promise<Paginated<UserAdminDto>> {
    return this.users.list(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a staff account (sales, warehouse or administrator)',
  })
  createStaff(
    @Body() dto: CreateStaffUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<UserAdminDto> {
    return this.users.createStaff(dto, actor, meta);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change a user role or activate/deactivate an account',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<UserAdminDto> {
    return this.users.adminUpdate(id, dto, actor, meta);
  }
}
