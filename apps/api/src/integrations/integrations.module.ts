import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DispatchEventsController } from './dispatch-events.controller';
import { DispatchEventsService } from './dispatch-events.service';

/** Inbound integrations with other systems: webhooks from the dispatch delivery service. */
@Module({
  imports: [OrdersModule],
  controllers: [DispatchEventsController],
  providers: [DispatchEventsService],
})
export class IntegrationsModule {}
