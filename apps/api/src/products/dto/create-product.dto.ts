import {
  IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min,
} from 'class-validator';
import { StockStatus } from 'database/dist/generated/prisma/client';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @IsOptional()
  categoryId?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  specifications?: Record<string, any>;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsEnum(StockStatus)
  @IsOptional()
  stockStatus?: StockStatus;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockQuantity?: number;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}