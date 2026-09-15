import {
  cancelOrderSchema,
  checkoutSchema,
  orderQuerySchema,
  recordPaymentSchema,
  updateOrderStatusSchema,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';

export class CheckoutDto extends createZodDto(checkoutSchema) {}
export class OrderQueryDto extends createZodDto(orderQuerySchema) {}
export class UpdateOrderStatusDto extends createZodDto(
  updateOrderStatusSchema,
) {}
export class CancelOrderDto extends createZodDto(cancelOrderSchema) {}
export class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
