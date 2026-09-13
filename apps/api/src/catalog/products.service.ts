import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@topflow/database';
import {
  ProductSort,
  StockStatus,
  type AdjustStockInput,
  type CreateProductInput,
  type Paginated,
  type ProductDto,
  type ProductQuery,
  type UpdateProductInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestMeta } from '../common/request-context';
import { pageArgs, paginated } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogViewer } from './catalog-context.service';
import { RETAIL_PRICING } from './pricing';
import { productInclude, toProductDto } from './product.mapper';

const ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput[]> =
  {
    newest: [{ createdAt: 'desc' }],
    name: [{ name: 'asc' }],
    price_asc: [{ unitPrice: 'asc' }, { name: 'asc' }],
    price_desc: [{ unitPrice: 'desc' }, { name: 'asc' }],
  };

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private visibility(
    viewer: CatalogViewer,
    includeInactive = false,
  ): Prisma.ProductWhereInput {
    return {
      ...(!(includeInactive && viewer.canSeeInactive) && { isActive: true }),
      ...(!viewer.canSeeTradeOnly && { isTradeOnly: false }),
    };
  }

  async list(
    query: ProductQuery,
    viewer: CatalogViewer,
  ): Promise<Paginated<ProductDto>> {
    const where: Prisma.ProductWhereInput = {
      ...this.visibility(viewer, query.includeInactive),
      ...(query.brand && {
        brand: { equals: query.brand, mode: 'insensitive' },
      }),
      ...(query.stockStatus && { stockStatus: query.stockStatus }),
      ...(query.category && {
        category: {
          OR: [{ slug: query.category }, { parent: { slug: query.category } }],
        },
      }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { brand: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: ORDER_BY[query.sort],
        ...pageArgs(query),
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(
      products.map((p) => toProductDto(p, viewer.pricing)),
      total,
      query,
    );
  }

  /** Looks a product up by slug (storefront URLs) or id (back office). */
  async get(slugOrId: string, viewer: CatalogViewer): Promise<ProductDto> {
    const product = await this.prisma.product.findFirst({
      where: {
        ...this.visibility(viewer, true),
        OR: [
          { slug: slugOrId },
          { id: slugOrId.length === 36 ? slugOrId : undefined },
        ],
      },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return toProductDto(product, viewer.pricing);
  }

  async brands(
    viewer: CatalogViewer,
  ): Promise<Array<{ brand: string; productCount: number }>> {
    const groups = await this.prisma.product.groupBy({
      by: ['brand'],
      where: { ...this.visibility(viewer), brand: { not: null } },
      _count: { _all: true },
      orderBy: { brand: 'asc' },
    });
    return groups.map((group) => ({
      brand: group.brand as string,
      productCount: group._count._all,
    }));
  }

  async create(
    input: CreateProductInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<ProductDto> {
    const product = await this.prisma.product.create({
      data: {
        ...input,
        slug: input.slug ?? slugify(`${input.name}-${input.sku}`),
        specifications: input.specifications,
      },
      include: productInclude,
    });
    await this.audit.record({
      action: AuditAction.PRODUCT_CREATED,
      entityType: 'Product',
      entityId: product.id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { sku: product.sku },
    });
    return toProductDto(product, RETAIL_PRICING);
  }

  async update(
    id: string,
    input: UpdateProductInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<ProductDto> {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: input,
      include: productInclude,
    });
    await this.audit.record({
      action: AuditAction.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { fields: Object.keys(input) },
    });
    return toProductDto(product, RETAIL_PRICING);
  }

  /**
   * Products are archived, never hard-deleted: historic orders, quotations and RFQs keep
   * referencing them (the prototype deleted items outright, orphaning order data).
   */
  async archive(
    id: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<ProductDto> {
    await this.findOrThrow(id);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });
    await this.audit.record({
      action: AuditAction.PRODUCT_ARCHIVED,
      entityType: 'Product',
      entityId: id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
    });
    return toProductDto(product, RETAIL_PRICING);
  }

  async adjustStock(
    id: string,
    input: AdjustStockInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<ProductDto> {
    const current = await this.findOrThrow(id);
    const stockStatus =
      input.stockStatus ??
      (input.stockQuantity > 0 ? StockStatus.IN_STOCK : StockStatus.ON_ORDER);
    const product = await this.prisma.product.update({
      where: { id },
      data: { stockQuantity: input.stockQuantity, stockStatus },
      include: productInclude,
    });
    await this.audit.record({
      action: AuditAction.STOCK_ADJUSTED,
      entityType: 'Product',
      entityId: id,
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: {
        from: current.stockQuantity,
        to: input.stockQuantity,
        stockStatus,
        note: input.note ?? null,
      },
    });
    return toProductDto(product, RETAIL_PRICING);
  }

  private async findOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}
