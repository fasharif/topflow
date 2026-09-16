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
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  ORGANIZATION_HEADER,
  OrgPermission,
  Permission,
  type Paginated,
  type QuotationDto,
  type QuotationSummaryDto,
  type RfqDto,
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
  ApprovalDecisionDto,
  AssignRfqCustomerDto,
  CreateQuotationDto,
  CreateRfqDto,
  QuotationQueryDto,
  RespondPersonalQuotationDto,
  RespondQuotationDto,
  RfqQueryDto,
  UpdateQuotationDto,
  UpdateRfqDto,
} from './procurement.dto';
import { QuotationsService } from './quotations.service';
import { RfqService } from './rfq.service';

function pdfFile({
  filename,
  buffer,
}: {
  filename: string;
  buffer: Buffer;
}): StreamableFile {
  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
    length: buffer.length,
  });
}

@ApiTags('B2B · Procurement')
@ApiBearerAuth()
@ApiHeader({ name: ORGANIZATION_HEADER, required: true })
@Controller('org')
export class OrgProcurementController {
  constructor(
    private readonly rfqs: RfqService,
    private readonly quotations: QuotationsService,
  ) {}

  @Get('rfqs')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  listRfqs(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: RfqQueryDto,
  ): Promise<Paginated<RfqDto>> {
    return this.rfqs.listForOrganization(org, query);
  }

  @Post('rfqs')
  @RequireOrgPermission(OrgPermission.RFQ_CREATE)
  @ApiOperation({
    summary: 'Submit a request for quotation for the organization',
  })
  createRfq(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: CreateRfqDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<RfqDto> {
    return this.rfqs.create(org, dto, user, meta);
  }

  @Get('rfqs/:id')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  getRfq(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RfqDto> {
    return this.rfqs.getForOrganization(org, id);
  }

  @Post('rfqs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.RFQ_CREATE)
  cancelRfq(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<RfqDto> {
    return this.rfqs.cancel(org, id, user, meta);
  }

  @Get('quotations')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  listQuotations(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: QuotationQueryDto,
  ): Promise<Paginated<QuotationSummaryDto>> {
    return this.quotations.orgList(org, query);
  }

  @Get('quotations/:id')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  getQuotation(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuotationDto> {
    return this.quotations.orgGet(org, id);
  }

  @Get('quotations/:id/pdf')
  @ApiProduces('application/pdf')
  @RequireOrgPermission(OrgPermission.ORDERS_VIEW)
  async quotationPdf(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return pdfFile(
      await this.quotations.renderPdf(id, {
        organizationId: org.organizationId,
      }),
    );
  }

  @Post('quotations/:id/respond')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.QUOTE_RESPOND)
  @ApiOperation({
    summary:
      'Accept (optionally with a PO number), reject or request a revision',
  })
  respond(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.respond(org, id, dto, user, meta);
  }

  @Post('quotations/:id/approval')
  @HttpCode(HttpStatus.OK)
  @RequireOrgPermission(OrgPermission.PURCHASE_APPROVE)
  @ApiOperation({
    summary:
      "Approve or decline a colleague's purchase that exceeded their spending limit",
  })
  decide(
    @CurrentOrganization() org: OrganizationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApprovalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.decideApproval(org, id, dto, user, meta);
  }
}

/** Quotations addressed to a customer personally, typically answering a website quote request. */
@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('me/quotations')
export class MyQuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuotationQueryDto,
  ): Promise<Paginated<QuotationSummaryDto>> {
    return this.quotations.personalList(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<QuotationDto> {
    return this.quotations.personalGet(user, id);
  }

  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return pdfFile(
      await this.quotations.renderPdf(id, { customerId: user.id }),
    );
  }

  @Post(':id/respond')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept (choosing a delivery address), reject or request a revision',
  })
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondPersonalQuotationDto,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.personalRespond(user, id, dto, meta);
  }
}

@ApiTags('Admin · Procurement')
@ApiBearerAuth()
@Controller('admin')
export class AdminProcurementController {
  constructor(
    private readonly rfqs: RfqService,
    private readonly quotations: QuotationsService,
  ) {}

  @Get('rfqs')
  @RequirePermissions(Permission.RFQS_MANAGE)
  listRfqs(@Query() query: RfqQueryDto): Promise<Paginated<RfqDto>> {
    return this.rfqs.adminList(query);
  }

  @Get('rfqs/:id')
  @RequirePermissions(Permission.RFQS_MANAGE)
  getRfq(@Param('id', ParseUUIDPipe) id: string): Promise<RfqDto> {
    return this.rfqs.adminGet(id);
  }

  @Patch('rfqs/:id')
  @RequirePermissions(Permission.RFQS_MANAGE)
  updateRfq(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRfqDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<RfqDto> {
    return this.rfqs.adminUpdate(id, dto, user, meta);
  }

  @Post('rfqs/:id/customer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.RFQS_MANAGE)
  @ApiOperation({
    summary:
      'Link a website request to an existing customer, or invite its contact to create an account',
  })
  assignRfqCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRfqCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<RfqDto> {
    return this.rfqs.assignCustomer(id, dto, user, meta);
  }

  @Get('quotations')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  listQuotations(
    @Query() query: QuotationQueryDto,
  ): Promise<Paginated<QuotationSummaryDto>> {
    return this.quotations.adminList(query);
  }

  @Post('quotations')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  @ApiOperation({
    summary: 'Draft a quotation for an RFQ or directly for a customer',
  })
  createQuotation(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.create(dto, user, meta);
  }

  @Get('quotations/:id')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  getQuotation(@Param('id', ParseUUIDPipe) id: string): Promise<QuotationDto> {
    return this.quotations.adminGet(id);
  }

  @Patch('quotations/:id')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  updateQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.update(id, dto, user, meta);
  }

  @Delete('quotations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  discardQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.quotations.discard(id, user, meta);
  }

  @Post('quotations/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  sendQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.send(id, user, meta);
  }

  @Post('quotations/:id/revise')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  @ApiOperation({
    summary:
      'Start the next revision as a draft (lines copied unless provided)',
  })
  reviseQuotation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<QuotationDto> {
    return this.quotations.revise(id, dto, user, meta);
  }

  @Get('quotations/:id/pdf')
  @ApiProduces('application/pdf')
  @RequirePermissions(Permission.QUOTATIONS_MANAGE)
  async quotationPdf(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    return pdfFile(await this.quotations.renderPdf(id));
  }
}
