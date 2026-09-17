import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuotationPdfService } from '../documents/quotation-pdf.service';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import {
  AdminProcurementController,
  MyQuotationsController,
  OrgProcurementController,
} from './procurement.controller';
import { QuotationsService } from './quotations.service';
import { WebsiteQuoteRequestsController } from './quote-requests.controller';
import { RfqService } from './rfq.service';

@Module({
  imports: [AuthModule, UsersModule, OrdersModule],
  controllers: [
    OrgProcurementController,
    MyQuotationsController,
    AdminProcurementController,
    WebsiteQuoteRequestsController,
  ],
  providers: [RfqService, QuotationsService, QuotationPdfService],
})
export class ProcurementModule {}
