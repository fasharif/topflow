import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ORGANIZATION_HEADER,
  Permission,
  type CategoryDto,
  type Paginated,
  type ProductDto,
} from '@topflow/shared';
import {
  CurrentUser,
  Meta,
  Public,
  RequirePermissions,
} from '../common/decorators';
import type {
  AppRequest,
  AuthenticatedUser,
  RequestMeta,
} from '../common/request-context';
import {
  AdjustStockDto,
  CreateCategoryDto,
  CreateProductDto,
  ProductQueryDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto';
import { CatalogContextService } from './catalog-context.service';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';

@ApiTags('Catalog')
@ApiHeader({
  name: ORGANIZATION_HEADER,
  required: false,
  description:
    'Optional: show trade-only products and negotiated prices for this organization',
})
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly viewer: CatalogContextService,
  ) {}

  @Public()
  @Get('products')
  async listProducts(
    @Query() query: ProductQueryDto,
    @Req() req: AppRequest,
  ): Promise<Paginated<ProductDto>> {
    return this.products.list(query, await this.viewer.resolve(req));
  }

  @Public()
  @Get('products/:slug')
  @ApiOperation({ summary: 'Product detail by slug (or id)' })
  async getProduct(
    @Param('slug') slug: string,
    @Req() req: AppRequest,
  ): Promise<ProductDto> {
    return this.products.get(slug, await this.viewer.resolve(req));
  }

  @Public()
  @Get('categories')
  listCategories(): Promise<CategoryDto[]> {
    return this.categories.list();
  }

  @Public()
  @Get('brands')
  async listBrands(
    @Req() req: AppRequest,
  ): Promise<Array<{ brand: string; productCount: number }>> {
    return this.products.brands(await this.viewer.resolve(req));
  }
}

@ApiTags('Admin · Catalog')
@ApiBearerAuth()
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly viewer: CatalogContextService,
  ) {}

  @Get('products')
  @RequirePermissions(Permission.CATALOG_WRITE)
  async listProducts(
    @Query() query: ProductQueryDto,
    @Req() req: AppRequest,
  ): Promise<Paginated<ProductDto>> {
    return this.products.list(query, await this.viewer.resolve(req));
  }

  @Post('products')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<ProductDto> {
    return this.products.create(dto, user, meta);
  }

  @Patch('products/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<ProductDto> {
    return this.products.update(id, dto, user, meta);
  }

  @Delete('products/:id')
  @RequirePermissions(Permission.CATALOG_DELETE)
  @ApiOperation({
    summary: 'Archive (unpublish) a product — history is preserved',
  })
  archiveProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<ProductDto> {
    return this.products.archive(id, user, meta);
  }

  @Patch('products/:id/stock')
  @RequirePermissions(Permission.STOCK_WRITE)
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<ProductDto> {
    return this.products.adjustStock(id, dto, user, meta);
  }

  @Post('categories')
  @RequirePermissions(Permission.CATALOG_WRITE)
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<CategoryDto> {
    return this.categories.create(dto, user, meta);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto, user, meta);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CATALOG_DELETE)
  removeCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.categories.remove(id, user, meta);
  }
}
