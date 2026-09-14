import { z } from 'zod';
import { StockStatus, UnitOfMeasure } from '../enums';
import { toFils } from '../money';
import { moneySchema, optionalText, paginationSchema, slugSchema } from './common';

/** An absolute http(s) URL, or a path served by the web app such as `/catalog/products/disc-filter.webp`. */
const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(value) || /^\/(?!\/)[\w.~/-]+$/.test(value), {
    error: 'Enter an image URL (https://…) or a site path starting with /',
  });

/** An indicative range must not be inverted. Only checked when both ends are supplied. */
function priceRangeInOrder(data: { priceMin?: string | null; priceMax?: string | null }, ctx: z.RefinementCtx): void {
  if (data.priceMin != null && data.priceMax != null && toFils(data.priceMin) > toFils(data.priceMax)) {
    ctx.addIssue({ code: 'custom', path: ['priceMax'], message: 'The upper price must be at least the lower price' });
  }
}

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

const specificationValue = z.union([z.string().trim().max(500), z.number(), z.boolean()]);

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
  priceMin: moneySchema.nullable(),
  priceMax: moneySchema.nullable(),
  uom: z.enum(UnitOfMeasure),
  minOrderQty: z.number().int().min(1).max(100_000),
  stockStatus: z.enum(StockStatus),
  stockQuantity: z.number().int().min(0).max(10_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  imageUrl: imageUrlSchema.nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(20),
  isActive: z.boolean(),
  isTradeOnly: z.boolean(),
};

/** Updates are partial and never fall back to defaults. */
export const updateProductSchema = z.object(productShape).partial().superRefine(priceRangeInOrder);
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
  priceMin: productShape.priceMin.optional(),
  priceMax: productShape.priceMax.optional(),
  imageUrl: productShape.imageUrl.optional(),
  tags: productShape.tags.default([]),
  isActive: productShape.isActive.default(true),
  isTradeOnly: productShape.isTradeOnly.default(false),
}).superRefine(priceRangeInOrder);
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
  imageUrl: imageUrlSchema.nullable(),
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
