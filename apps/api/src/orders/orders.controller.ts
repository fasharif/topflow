import { Controller, Get, Param, Post, Res, UseGuards, Body } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { QuotationService } from './quotation.service';
import { CreateOrderDto } from './dto/create-order.dto';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly quotationService: QuotationService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findAllForUser(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.findOne(user.id, user.role, id);
  }

  @Get(':id/quotation.pdf')
  async getQuotationPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const order = await this.ordersService.findOne(user.id, user.role, id);
    const pdfBuffer = await this.quotationService.generatePdf(order as any);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="quotation-${order.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}