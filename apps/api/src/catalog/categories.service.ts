import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Category } from '@topflow/database';
import type {
  CategoryDto,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@topflow/shared';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser, RequestMeta } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

function toCategoryDto(
  category: Category & { _count?: { products: number } },
): CategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    displayOrder: category.displayOrder,
    parentId: category.parentId,
    productCount: category._count?.products,
  };
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Categories with the number of products visible to retail shoppers. A parent's count
   * includes its sub-categories, matching the catalog filter, which includes them too.
   */
  async list(): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: {
            products: { where: { isActive: true, isTradeOnly: false } },
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    const totals = new Map(
      categories.map((category) => [category.id, category._count.products]),
    );
    for (const category of categories) {
      if (category.parentId !== null) {
        totals.set(
          category.parentId,
          (totals.get(category.parentId) ?? 0) + category._count.products,
        );
      }
    }
    return categories.map((category) => ({
      ...toCategoryDto(category),
      productCount: totals.get(category.id) ?? 0,
    }));
  }

  async create(
    input: CreateCategoryInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<CategoryDto> {
    const category = await this.prisma.category.create({ data: input });
    await this.record(category.id, 'created', actor, meta);
    return toCategoryDto(category);
  }

  async update(
    id: number,
    input: UpdateCategoryInput,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<CategoryDto> {
    await this.findOrThrow(id);
    if (input.parentId === id) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    const category = await this.prisma.category.update({
      where: { id },
      data: input,
    });
    await this.record(id, 'updated', actor, meta);
    return toCategoryDto(category);
  }

  /** Deleting a category leaves its products uncategorised (FK is ON DELETE SET NULL). */
  async remove(
    id: number,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.category.delete({ where: { id } });
    await this.record(id, 'deleted', actor, meta);
  }

  private async findOrThrow(id: number): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private record(
    id: number,
    change: string,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<void> {
    return this.audit.record({
      action: AuditAction.CATEGORY_CHANGED,
      entityType: 'Category',
      entityId: String(id),
      userId: actor.id,
      ipAddress: meta.ipAddress,
      details: { change },
    });
  }
}
