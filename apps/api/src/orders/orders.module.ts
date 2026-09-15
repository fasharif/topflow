import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrderWriter } from './order-writer.service';
import {
  AdminOrdersController,
  MyOrdersController,
  OrgOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [UsersModule],
  controllers: [MyOrdersController, OrgOrdersController, AdminOrdersController],
  providers: [OrderWriter, OrdersService],
  exports: [OrderWriter],
})
export class OrdersModule {}
