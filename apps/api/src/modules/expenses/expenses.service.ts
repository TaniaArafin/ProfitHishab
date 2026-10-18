import { Injectable } from '@nestjs/common';
import type { Expense, ExpenseCategory } from '@prisma/client';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  monthPeriod,
  type ExpenseCategoryDto,
  type ExpenseCategoryInput,
  type ExpenseDto,
  type ExpenseInput,
  type ExpenseKind,
  type ExpenseListDto,
  type Period,
} from '@ph/shared';
import { fromDbDate, toDbDate } from '../../common/dates';
import type { Tx } from '../../common/prisma.service';
import { ExpenseError } from './expenses.errors';
import { ExpensesRepository } from './expenses.repository';

export const toCategoryDto = (c: ExpenseCategory): ExpenseCategoryDto => ({
  id: c.id,
  name: c.name,
  kind: c.kind as ExpenseKind,
  isSystem: c.isSystem,
});

const toExpenseDto = (e: Expense & { category: ExpenseCategory }): ExpenseDto => ({
  id: e.id,
  categoryId: e.categoryId,
  categoryName: e.category.name,
  kind: e.category.kind as ExpenseKind,
  amount: e.amount,
  expenseDate: fromDbDate(e.expenseDate),
  note: e.note,
});

@Injectable()
export class ExpensesService {
  constructor(private readonly repo: ExpensesRepository) {}

  /** Called by Auth inside the registration transaction (FR-EXP-01). */
  async seedDefaultCategories(businessId: string, db: Tx): Promise<void> {
    await this.repo.seedCategories(businessId, DEFAULT_EXPENSE_CATEGORIES, db);
  }

  async updateCategory(businessId: string, categoryId: string, input: Partial<ExpenseCategoryInput>): Promise<ExpenseCategoryDto> {
    const category = await this.repo.findCategory(businessId, categoryId);
    if (!category) throw ExpenseError.categoryNotFound();
    if (category.isSystem && input.kind && input.kind !== category.kind) {
      throw ExpenseError.builtInKindLocked();
    }
    return toCategoryDto(await this.repo.updateCategory(categoryId, input));
  }

  async deleteCategory(businessId: string, categoryId: string): Promise<void> {
    const category = await this.repo.findCategory(businessId, categoryId);
    if (!category) throw ExpenseError.categoryNotFound();
    if (category.isSystem) throw ExpenseError.builtInUndeletable();
    const used = await this.repo.countExpensesInCategory(categoryId);
    if (used > 0) throw ExpenseError.categoryInUse(used);
    await this.repo.deleteCategory(categoryId);
  }

  async list(businessId: string, period: Period, categoryId?: string): Promise<ExpenseListDto> {
    const rows = await this.repo.inPeriod(businessId, period, categoryId);
    const totals = new Map<string, ExpenseListDto['totals'][number]>();
    for (const e of rows) {
      const t = totals.get(e.categoryId) ?? {
        categoryId: e.categoryId,
        categoryName: e.category.name,
        kind: e.category.kind as ExpenseKind,
        amount: 0,
      };
      t.amount += e.amount;
      totals.set(e.categoryId, t);
    }
    return {
      data: rows.map(toExpenseDto),
      totals: [...totals.values()].sort((a, b) => b.amount - a.amount),
      total: rows.reduce((sum, e) => sum + e.amount, 0),
      warning: await this.doubleCountWarning(businessId, period, rows),
    };
  }

  async create(businessId: string, userId: string, input: ExpenseInput): Promise<{ expense: ExpenseDto; warning: string | null }> {
    const category = await this.repo.findCategory(businessId, input.categoryId);
    if (!category) throw ExpenseError.categoryNotFound();
    const expense = await this.repo.create(businessId, { ...input, expenseDate: toDbDate(input.expenseDate), createdById: userId });
    const period = monthPeriod(input.expenseDate);
    return { expense: toExpenseDto(expense), warning: await this.doubleCountWarning(businessId, period, [expense]) };
  }

  async update(businessId: string, expenseId: string, input: Partial<ExpenseInput>): Promise<ExpenseDto> {
    if (!(await this.repo.find(businessId, expenseId))) throw ExpenseError.notFound();
    if (input.categoryId && !(await this.repo.findCategory(businessId, input.categoryId))) throw ExpenseError.categoryNotFound();
    const { expenseDate, ...rest } = input;
    return toExpenseDto(await this.repo.update(expenseId, { ...rest, ...(expenseDate ? { expenseDate: toDbDate(expenseDate) } : {}) }));
  }

  async delete(businessId: string, expenseId: string): Promise<void> {
    if (!(await this.repo.find(businessId, expenseId))) throw ExpenseError.notFound();
    await this.repo.delete(expenseId);
  }

  /** FR-EXP-05: courier or packaging expenses on top of per-order costs are probably counted twice. */
  private async doubleCountWarning(
    businessId: string,
    period: Period,
    expenses: Array<Expense & { category: ExpenseCategory }>,
  ): Promise<string | null> {
    const hasCourier = expenses.some((e) => e.category.kind === 'courier');
    const hasPackaging = expenses.some((e) => e.category.name.toLowerCase() === 'packaging');
    if (!hasCourier && !hasPackaging) return null;

    const presence = await this.repo.orderCostPresence(businessId, period);
    if (hasCourier && presence.courier) {
      return 'Orders in this period already include courier costs. This expense may count courier charges twice.';
    }
    if (hasPackaging && presence.packaging) {
      return 'Orders in this period already include packaging costs. This expense may count packaging twice.';
    }
    return null;
  }
}
