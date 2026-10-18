import { Module } from '@nestjs/common';
import { ProfitController } from './profit.controller';
import { ProfitRepository } from './profit.repository';
import { ProfitService } from './profit.service';

@Module({
  controllers: [ProfitController],
  providers: [ProfitRepository, ProfitService],
})
export class ProfitModule {}
