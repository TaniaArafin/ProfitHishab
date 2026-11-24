import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessRepository } from './business.repository';
import { BusinessService } from './business.service';
import { LogoStore } from './logo.store';

/** Exports only its service: the repository is private to this module. */
@Module({
  controllers: [BusinessController],
  providers: [BusinessRepository, BusinessService, LogoStore],
  exports: [BusinessService],
})
export class BusinessModule {}
