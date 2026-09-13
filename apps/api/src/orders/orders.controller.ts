import {
  Body,
  Controller,
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
import {
  ORGANIZATION_HEADER,
  OrgPermission,
  Permission,
  type OrderDto,
  type OrderSummaryDto,
  type Paginated,
} from '@topflow/shared';
import {
  CurrentOrganization,
  CurrentUser,
  Meta,
  RequireOrgPermission,
  RequirePermissions,
} from '../common/decorators';
import type {
  AuthenticatedUser,
  OrganizationContext,
  RequestMeta,
} from '../common/request-context';
import {
  CancelOrderDto,
  CheckoutDto,
  OrderQueryDto,
  RecordPaymentDto,
  UpdateOrderStatusDto,
} from './orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Retail checkout — the server prices every line, delivery and VAT',
  })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
    @Meta() meta: RequestMeta,
  ): Promise<OrderDto> {
    return this.orders.checkout(user, dto, meta);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrderQueryDto,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.listMine(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return this.orders.getMine(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @Meta() meta: RequestMeta,
  ): Promise<OrderDto> {
    return this.orders.cancelMine(user, id, dto, meta);
  }
}

@ApiTags('B2B · Orders')
@ApiBearerAuth()
@ApiHeader({ name: ORGANIZATION_HEADER, required: true })
@Controller('org/orders')
export class OrgOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  list(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: OrderQueryDto,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.listForOrganization(org, query);
  }

  @Get(':id')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  get(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return this.orders.getForOrganization(org, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.PURCHASE_APPROVE)
  @ApiOperation({
    summary:
      'Cancel a committed purchase before picking starts (approvers and owners)',
  })
  cancel(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<OrderDto> {
    return this.orders.cancelForOrganization(org, id, dto, user, meta);
  }
}

@ApiTags('Admin · Orders')
@ApiBearerAuth()
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(Permission.ORDERS_READ_ALL)
  list(@Query() query: OrderQueryDto): Promise<Paginated<OrderSummaryDto>> {
    return this.orders.adminList(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.ORDERS_READ_ALL)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return this.orders.adminGet(user, id);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.ORDERS_READ_ALL)
  @ApiOperation({
    summary: 'Advance fulfilment (each target status needs its own permission)',
  })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Meta() meta: RequestMeta,
  ): Promise<OrderDto> {
    return this.orders.transition(user, id, dto, meta);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ORDERS_MANAGE)
  @ApiOperation({
    summary: 'Record a received payment (releases prepaid orders)',
  })
  recordPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @Meta() meta: RequestMeta,
  ): Promise<OrderDto> {
    return this.orders.recordPayment(user, id, dto, meta);
  }
}
