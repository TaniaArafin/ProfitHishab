import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, BusinessModule],
  controllers: [AdminController],
  providers: [AdminRepository, AdminService, AdminGuard],
  // For the admin:grant script.
  exports: [AdminService],
})
export class AdminModule {}
