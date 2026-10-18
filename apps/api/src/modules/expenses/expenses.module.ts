import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesRepository, ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
