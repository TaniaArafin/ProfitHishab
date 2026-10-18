import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Period } from '@ph/shared';
import { toDbDate } from '../../common/dates';
import { PrismaService, type Tx } from '../../common/prisma.service';

@Injectable()
export class ExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedCategories(businessId: string, categories: ReadonlyArray<{ name: string; kind: string }>, db: Tx) {
    return db.expenseCategory.createMany({ data: categories.map((c) => ({ ...c, businessId, isSystem: true })) });
  }

  allCategories(businessId: string) {
    return this.prisma.expenseCategory.findMany({ where: { businessId }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  }

  findCategory(businessId: string, categoryId: string) {
    return this.prisma.expenseCategory.findFirst({ where: { id: categoryId, businessId } });
  }

  createCategory(businessId: string, data: { name: string; kind: string }) {
    return this.prisma.expenseCategory.create({ data: { ...data, businessId, isSystem: false } });
  }

  updateCategory(categoryId: string, data: { name?: string; kind?: string }) {
    return this.prisma.expenseCategory.update({ where: { id: categoryId }, data });
  }

  countExpensesInCategory(categoryId: string) {
    return this.prisma.expense.count({ where: { categoryId } });
  }

  deleteCategory(categoryId: string) {
    return this.prisma.expenseCategory.delete({ where: { id: categoryId } });
  }

  inPeriod(businessId: string, period: Period, categoryId?: string) {
    return this.prisma.expense.findMany({
      where: {
        businessId,
        expenseDate: { gte: toDbDate(period.from), lte: toDbDate(period.to) },
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  find(businessId: string, expenseId: string) {
    return this.prisma.expense.findFirst({ where: { id: expenseId, businessId }, include: { category: true } });
  }

  create(businessId: string, data: Omit<Prisma.ExpenseUncheckedCreateInput, 'businessId'>) {
    return this.prisma.expense.create({ data: { ...data, businessId }, include: { category: true } });
  }

  update(expenseId: string, data: Prisma.ExpenseUncheckedUpdateInput) {
    return this.prisma.expense.update({ where: { id: expenseId }, data, include: { category: true } });
  }

  delete(expenseId: string) {
    return this.prisma.expense.delete({ where: { id: expenseId } });
  }

  /** For the double-counting warning (FR-EXP-05): do orders in the period already carry these costs? */
  async orderCostPresence(businessId: string, period: Period): Promise<{ courier: boolean; packaging: boolean }> {
    const [row] = await this.prisma.$queryRaw<[{ courier: boolean; packaging: boolean }]>`
      SELECT coalesce(bool_or("courierCost" > 0), false) AS courier, coalesce(bool_or("packagingCost" > 0), false) AS packaging
      FROM orders
      WHERE "businessId" = ${businessId}::uuid AND status IN ('delivered', 'returned')
        AND "orderDate" BETWEEN ${period.from}::date AND ${period.to}::date`;
    return row;
  }
}
