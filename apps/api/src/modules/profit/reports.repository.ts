import { Injectable } from '@nestjs/common';
import type { Period } from '@ph/shared';
import { PrismaService } from '../../common/prisma.service';
import type { ExpenseAggregates, OrderAggregates } from './profit.calculator';
import { foldExpenseRows, foldStatusRows, type ExpenseKindRow, type StatusRow } from './profit.repository';

/** Groups rows by `month` (`YYYY-MM`) and folds each group. */
function byMonth<R extends { month: string }, T>(rows: R[], fold: (rows: R[]) => T): Map<string, T> {
  const groups = new Map<string, R[]>();
  for (const r of rows) groups.set(r.month, [...(groups.get(r.month) ?? []), r]);
  return new Map([...groups].map(([month, group]) => [month, fold(group)]));
}

/**
 * FR-REP: report queries, read-only SQL over orders and expenses grouped by month (the same
 * reporting exception as ProfitRepository). Sums are cast to float8 so they arrive as JS numbers.
 */
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async monthlyOrderAggregates(businessId: string, period: Period): Promise<Map<string, OrderAggregates>> {
    const rows = await this.prisma.$queryRaw<Array<StatusRow & { month: string }>>`
      SELECT to_char("orderDate", 'YYYY-MM') AS month,
             status,
             count(*)::int AS count,
             coalesce(sum(subtotal), 0)::float8 AS subtotal,
             coalesce(sum(discount), 0)::float8 AS discount,
             coalesce(sum("deliveryCharge"), 0)::float8 AS "deliveryCharge",
             coalesce(sum("productCost"), 0)::float8 AS "productCost",
             coalesce(sum("courierCost"), 0)::float8 AS "courierCost",
             coalesce(sum("packagingCost"), 0)::float8 AS "packagingCost",
             coalesce(sum("returnCost"), 0)::float8 AS "returnCost"
      FROM orders
      WHERE "businessId" = ${businessId}::uuid AND "orderDate" BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY 1, 2`;
    return byMonth(rows, foldStatusRows);
  }

  async monthlyExpenseAggregates(businessId: string, period: Period): Promise<Map<string, ExpenseAggregates>> {
    const rows = await this.prisma.$queryRaw<Array<ExpenseKindRow & { month: string }>>`
      SELECT to_char(e."expenseDate", 'YYYY-MM') AS month, ec.kind,
             coalesce(sum(e.amount), 0)::float8 AS amount, count(*)::int AS count
      FROM expenses e JOIN expense_categories ec ON ec.id = e."categoryId"
      WHERE e."businessId" = ${businessId}::uuid AND e."expenseDate" BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY 1, 2`;
    return byMonth(rows, foldExpenseRows);
  }

  /** Spend per category and month; categories with nothing in the period have no rows. */
  expensesByCategoryMonth(
    businessId: string,
    period: Period,
  ): Promise<Array<{ categoryId: string; categoryName: string; kind: string; month: string; amount: number }>> {
    return this.prisma.$queryRaw`
      SELECT ec.id AS "categoryId", ec.name AS "categoryName", ec.kind,
             to_char(e."expenseDate", 'YYYY-MM') AS month, coalesce(sum(e.amount), 0)::float8 AS amount
      FROM expenses e JOIN expense_categories ec ON ec.id = e."categoryId"
      WHERE e."businessId" = ${businessId}::uuid AND e."expenseDate" BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY ec.id, ec.name, ec.kind, 4`;
  }
}
