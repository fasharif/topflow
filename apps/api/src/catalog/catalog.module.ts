import { Module } from '@nestjs/common';
import {
  AdminCatalogController,
  CatalogController,
} from './catalog.controller';
import { CatalogContextService } from './catalog-context.service';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';

@Module({
  controllers: [CatalogController, AdminCatalogController],
  providers: [ProductsService, CategoriesService, CatalogContextService],
  exports: [ProductsService, CatalogContextService],
})
export class CatalogModule {}
