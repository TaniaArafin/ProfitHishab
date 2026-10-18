import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [BusinessModule, ProductsModule, CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
})
export class OrdersModule {}
