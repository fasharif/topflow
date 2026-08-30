import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { QuotationService } from './quotation.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, QuotationService],
})
export class OrdersModule {}