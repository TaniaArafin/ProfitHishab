import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  expenseCategorySchema,
  expenseSchema,
  expenseUpdateSchema,
  periodQuerySchema,
  resolvePeriod,
  type ExpenseCategoryInput,
  type ExpenseInput,
} from '@ph/shared';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth';
import { zod } from '../../common/zod.pipe';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService, toCategoryDto } from './expenses.service';

const expenseListQuery = periodQuerySchema.extend({ categoryId: z.string().uuid().optional() });

@Controller()
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly repo: ExpensesRepository,
  ) {}

  @Get('expense-categories')
  async categories(@Auth() auth: AuthContext) {
    return { data: (await this.repo.allCategories(auth.businessId)).map(toCategoryDto) };
  }

  @Post('expense-categories')
  async createCategory(@Auth() auth: AuthContext, @Body(zod(expenseCategorySchema)) body: ExpenseCategoryInput) {
    return { data: toCategoryDto(await this.repo.createCategory(auth.businessId, body)) };
  }

  @Patch('expense-categories/:id')
  async updateCategory(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(expenseCategorySchema.partial())) body: Partial<ExpenseCategoryInput>,
  ) {
    return { data: await this.expenses.updateCategory(auth.businessId, id, body) };
  }

  @Delete('expense-categories/:id')
  @HttpCode(204)
  async deleteCategory(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.expenses.deleteCategory(auth.businessId, id);
  }

  @Get('expenses')
  list(@Auth() auth: AuthContext, @Query(zod(expenseListQuery)) query: z.infer<typeof expenseListQuery>) {
    const { preset: _preset, ...period } = resolvePeriod(query, auth.timezone);
    return this.expenses.list(auth.businessId, period, query.categoryId);
  }

  @Post('expenses')
  async create(@Auth() auth: AuthContext, @Body(zod(expenseSchema)) body: ExpenseInput) {
    const { expense, warning } = await this.expenses.create(auth.businessId, auth.userId, body);
    return { data: expense, warning };
  }

  @Patch('expenses/:id')
  async update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(expenseUpdateSchema)) body: Partial<ExpenseInput>,
  ) {
    return { data: await this.expenses.update(auth.businessId, id, body) };
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  async delete(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.expenses.delete(auth.businessId, id);
  }
}
