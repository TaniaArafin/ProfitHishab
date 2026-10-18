import { Injectable } from '@nestjs/common';
import {
  daysBetween,
  previousPeriod,
  type InsightDto,
  type Period,
  type ProductProfitReportDto,
  type ProfitSummaryDto,
  type TrendPointDto,
} from '@ph/shared';
import { fromDbDate } from '../../common/dates';
import { buildInsights, computeKpis, computeStatement, productHighlights, productProfitRows, returnLoss } from './profit.calculator';
import { ProfitRepository } from './profit.repository';

@Injectable()
export class ProfitService {
  constructor(private readonly repo: ProfitRepository) {}

  async summary(businessId: string, period: Period): Promise<ProfitSummaryDto> {
    const prev = previousPeriod(period);
    const [current, previous, productsMissingCost, hasOrders] = await Promise.all([
      this.periodFigures(businessId, period),
      this.periodFigures(businessId, prev),
      this.repo.countProductsMissingCost(businessId),
      this.repo.hasAnyOrders(businessId),
    ]);
    return {
      period,
      previousPeriod: prev,
      statement: current.statement,
      kpis: current.kpis,
      previous: { statement: previous.statement, kpis: previous.kpis },
      dataQuality: { productsMissingCost, expensesEntered: current.expenseCount > 0, hasOrders },
    };
  }

  async insights(businessId: string, period: Period): Promise<InsightDto[]> {
    const [current, previous, productsMissingCost] = await Promise.all([
      this.periodFigures(businessId, period),
      this.periodFigures(businessId, previousPeriod(period)),
      this.repo.countProductsMissingCost(businessId),
    ]);
    return buildInsights({
      current: { statement: current.statement, kpis: current.kpis, returnLoss: current.returnLoss },
      previous: { statement: previous.statement, kpis: previous.kpis },
      productsMissingCost,
      expensesEntered: current.expenseCount > 0,
    });
  }

  /** FR-DASH-04: daily points up to 62 days, monthly beyond. Empty buckets are filled with zeros. */
  async trend(businessId: string, period: Period): Promise<{ interval: 'day' | 'month'; points: TrendPointDto[] }> {
    const interval = daysBetween(period) <= 62 ? 'day' : 'month';
    const { orders, expenses } = await this.repo.trend(businessId, period, interval);

    const points = new Map<string, TrendPointDto>();
    for (const bucket of this.buckets(period, interval)) points.set(bucket, { bucket, revenue: 0, netProfit: 0 });
    for (const o of orders) {
      const p = points.get(fromDbDate(o.bucket));
      if (p) {
        p.revenue += o.revenue;
        p.netProfit += o.revenue - o.costs;
      }
    }
    for (const e of expenses) {
      const p = points.get(fromDbDate(e.bucket));
      if (p) p.netProfit -= e.amount;
    }
    return { interval, points: [...points.values()] };
  }

  async products(
    businessId: string,
    period: Period,
    filters: { categoryId?: string; q?: string; limit?: number },
  ): Promise<ProductProfitReportDto> {
    const [items, returned] = await Promise.all([
      this.repo.deliveredItems(businessId, period),
      this.repo.returnedUnits(businessId, period),
    ]);
    const categoryOf = new Map(items.map((i) => [i.productId, i.categoryId]));
    const q = filters.q?.toLowerCase();

    let rows = productProfitRows(items, returned).filter(
      (r) =>
        (!filters.categoryId || categoryOf.get(r.productId) === filters.categoryId) &&
        (!q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)),
    );
    const highlights = productHighlights(rows);
    if (filters.limit) rows = rows.slice(0, filters.limit);
    return { period, rows, highlights };
  }

  private async periodFigures(businessId: string, period: Period) {
    const [orders, expenses] = await Promise.all([
      this.repo.orderAggregates(businessId, period),
      this.repo.expenseAggregates(businessId, period),
    ]);
    const statement = computeStatement(orders, expenses);
    return { statement, kpis: computeKpis(orders, statement), returnLoss: returnLoss(orders), expenseCount: expenses.count };
  }

  private buckets(period: Period, interval: 'day' | 'month'): string[] {
    const out: string[] = [];
    const cursor = new Date(`${period.from}T00:00:00Z`);
    if (interval === 'month') cursor.setUTCDate(1);
    const end = new Date(`${period.to}T00:00:00Z`);
    while (cursor <= end) {
      out.push(cursor.toISOString().slice(0, 10));
      if (interval === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  }
}
