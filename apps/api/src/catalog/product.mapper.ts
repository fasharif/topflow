import type { Prisma } from '@topflow/database';
import type { PriceRangeDto, ProductDto } from '@topflow/shared';
import { money } from '../common/serialization';
import { retailPrice, tradePrice, type PricingContext } from './pricing';

type DecimalLike = { toString(): string };

/** A range is only shown when both ends are known. */
export function toPriceRange(
  min: DecimalLike | null,
  max: DecimalLike | null,
): PriceRangeDto | null {
  if (min === null || max === null) return null;
  return {
    min: money(min),
    max: money(max),
    retailMin: retailPrice(min),
    retailMax: retailPrice(max),
  };
}

export const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithCategory = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export function toProductDto(
  product: ProductWithCategory,
  pricing: PricingContext,
): ProductDto {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    specifications:
      (product.specifications as ProductDto['specifications']) ?? null,
    unitPrice: money(product.unitPrice),
    retailPrice: retailPrice(product.unitPrice),
    tradePrice: tradePrice(product.unitPrice, pricing),
    priceRange: toPriceRange(product.priceMin, product.priceMax),
    uom: product.uom,
    minOrderQty: product.minOrderQty,
    stockStatus: product.stockStatus,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    imageUrl: product.imageUrl,
    tags: product.tags,
    isActive: product.isActive,
    isTradeOnly: product.isTradeOnly,
    category: product.category,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
