import { Module } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { ProductPricesRepository } from './product-prices.repository';
import { ProductSearch } from './product-search';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsRepository, CategoriesRepository, ProductPricesRepository, ProductSearch, ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
