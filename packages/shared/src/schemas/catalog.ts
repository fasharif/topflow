import { z } from 'zod';
import { StockStatus, UnitOfMeasure } from '../enums';
import { moneySchema, optionalText, paginationSchema, slugSchema } from './common';

export const ProductSort = {
  NEWEST: 'newest',
  NAME: 'name',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
} as const;
export type ProductSort = (typeof ProductSort)[keyof typeof ProductSort];

export const productQuerySchema = paginationSchema.extend({
  search: optionalText(100),
  category: optionalText(120),
  brand: optionalText(60),
  stockStatus: z.enum(StockStatus).optional(),
  sort: z.enum(ProductSort).default(ProductSort.NEWEST),
  /** Staff only: include unpublished products. */
  includeInactive: z.stringbool().optional(),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

const specificationValue = z.union([z.string().trim().max(200), z.number(), z.boolean()]);

const productShape = {
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9][A-Z0-9._-]*$/, { error: 'Use letters, numbers, dots, dashes or underscores' }),
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  brand: optionalText(60),
  categoryId: z.number().int().positive().nullable(),
  description: optionalText(5000),
  specifications: z.record(z.string().trim().min(1).max(60), specificationValue),
  unitPrice: moneySchema,
  uom: z.enum(UnitOfMeasure),
  minOrderQty: z.number().int().min(1).max(100_000),
  stockStatus: z.enum(StockStatus),
  stockQuantity: z.number().int().min(0).max(10_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  imageUrl: z.url({ error: 'Enter a valid image URL' }).max(500).nullable(),
  isActive: z.boolean(),
  isTradeOnly: z.boolean(),
};

/** Updates are partial and never fall back to defaults. */
export const updateProductSchema = z.object(productShape).partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const createProductSchema = z.object({
  ...productShape,
  slug: productShape.slug.optional(),
  brand: productShape.brand,
  categoryId: productShape.categoryId.optional(),
  specifications: productShape.specifications.optional(),
  uom: productShape.uom.default(UnitOfMeasure.PIECE),
  minOrderQty: productShape.minOrderQty.default(1),
  stockStatus: productShape.stockStatus.default(StockStatus.IN_STOCK),
  stockQuantity: productShape.stockQuantity.default(0),
  lowStockThreshold: productShape.lowStockThreshold.default(10),
  imageUrl: productShape.imageUrl.optional(),
  isActive: productShape.isActive.default(true),
  isTradeOnly: productShape.isTradeOnly.default(false),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** Warehouse stock count / availability update. */
export const adjustStockSchema = z.object({
  stockQuantity: productShape.stockQuantity,
  stockStatus: productShape.stockStatus.optional(),
  note: optionalText(200),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

const categoryShape = {
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: optionalText(1000),
  imageUrl: z.url().max(500).nullable(),
  displayOrder: z.number().int().min(0).max(10_000),
  parentId: z.number().int().positive().nullable(),
};

export const createCategorySchema = z.object({
  ...categoryShape,
  imageUrl: categoryShape.imageUrl.optional(),
  displayOrder: categoryShape.displayOrder.default(0),
  parentId: categoryShape.parentId.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object(categoryShape).partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
