import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { BillingAdminController } from './billing-admin.controller';
import { BillingController } from './billing.controller';
import { BillingRepository } from './billing.repository';
import { BillingService } from './billing.service';

/**
 * Manual bKash/Nagad payments. Reaches other modules only through their services: access and
 * firstPaidAt via BusinessService, admin_actions via AdminService, the owner's email via AuthService.
 */
@Module({
  imports: [AuthModule, BusinessModule, AdminModule],
  controllers: [BillingController, BillingAdminController],
  providers: [BillingRepository, BillingService],
})
export class BillingModule {}
