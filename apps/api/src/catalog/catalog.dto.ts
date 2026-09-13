import {
  adjustStockSchema,
  createCategorySchema,
  createProductSchema,
  productQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from '@topflow/shared';
import { createZodDto } from 'nestjs-zod';

export class ProductQueryDto extends createZodDto(productQuerySchema) {}
export class CreateProductDto extends createZodDto(createProductSchema) {}
export class UpdateProductDto extends createZodDto(updateProductSchema) {}
export class AdjustStockDto extends createZodDto(adjustStockSchema) {}
export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
