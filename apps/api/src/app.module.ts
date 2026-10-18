import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CsrfMiddleware } from './common/csrf.middleware';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { loggerParams } from './common/logging';
import { PrismaModule } from './common/prisma.service';
import { config } from './config';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ProfitModule } from './modules/profit/profit.module';

@Module({
  imports: [
    LoggerModule.forRoot(loggerParams()),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config().rateLimitPerMinute }]),
    PrismaModule,
    AuthModule,
    BusinessModule,
    ProductsModule,
    CustomersModule,
    OrdersModule,
    ExpensesModule,
    ProfitModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('{*path}');
  }
}
