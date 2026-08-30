import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsString()
  shippingAddress!: string;

  @IsString()
  @IsOptional()
  projectReference?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}