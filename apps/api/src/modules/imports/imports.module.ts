import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ImportMappingsRepository } from './import-mappings.repository';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

/** Excel/CSV order import (FR-IMP-01–13). Exports nothing: no other module calls it. */
@Module({
  imports: [BusinessModule, OrdersModule, CustomersModule, ProductsModule],
  controllers: [ImportsController],
  providers: [ImportsRepository, ImportMappingsRepository, ImportsService],
})
export class ImportsModule {}
