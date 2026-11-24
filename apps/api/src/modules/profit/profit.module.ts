import { Module } from '@nestjs/common';
import { ProfitController } from './profit.controller';
import { ProfitRepository } from './profit.repository';
import { ProfitService } from './profit.service';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';

@Module({
  controllers: [ProfitController, ReportsController],
  providers: [ProfitRepository, ReportsRepository, ProfitService],
})
export class ProfitModule {}
