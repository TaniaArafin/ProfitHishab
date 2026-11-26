import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { BatchesRepository } from './batches.repository';
import { BatchesService } from './batches.service';
import { CategoriesRepository } from './categories.repository';
import { OptionListsController } from './option-lists.controller';
import { OptionListsRepository } from './option-lists.repository';
import { ProductPricesRepository } from './product-prices.repository';
import { ProductSearch } from './product-search';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsImportService } from './products-import.service';
import { ProductsService } from './products.service';
import { VariantsRepository } from './variants.repository';

@Module({
  imports: [ExpensesModule],
  controllers: [ProductsController, OptionListsController],
  providers: [
    ProductsRepository,
    BatchesRepository,
    BatchesService,
    VariantsRepository,
    OptionListsRepository,
    CategoriesRepository,
    ProductPricesRepository,
    ProductSearch,
    ProductsImportService,
    ProductsService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
