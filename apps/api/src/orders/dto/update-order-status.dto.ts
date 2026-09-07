import { IsEnum } from 'class-validator';
import { OrderStatus } from 'database/dist/generated/prisma/client';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
