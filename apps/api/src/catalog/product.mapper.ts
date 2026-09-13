import type { Prisma } from '@topflow/database';
import type { ProductDto } from '@topflow/shared';
import { money } from '../common/serialization';
import { retailPrice, tradePrice, type PricingContext } from './pricing';

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
    uom: product.uom,
    minOrderQty: product.minOrderQty,
    stockStatus: product.stockStatus,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    isTradeOnly: product.isTradeOnly,
    category: product.category,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
