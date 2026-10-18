import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Period } from '@ph/shared';
import { PrismaService } from '../../common/prisma.service';
import {
  EMPTY_EXPENSE_AGGREGATES,
  EMPTY_ORDER_AGGREGATES,
  type DeliveredItemRow,
  type ExpenseAggregates,
  type OrderAggregates,
} from './profit.calculator';

interface StatusRow {
  status: string;
  count: number;
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  productCost: number;
  courierCost: number;
  packagingCost: number;
  returnCost: number;
}

/** All profit figures are aggregated in SQL; sums are cast to float8 so they arrive as JS numbers. */
@Injectable()
export class ProfitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async orderAggregates(businessId: string, period: Period): Promise<OrderAggregates> {
    const rows = await this.prisma.$queryRaw<StatusRow[]>`
      SELECT status,
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
      GROUP BY status`;

    const agg: OrderAggregates = structuredClone(EMPTY_ORDER_AGGREGATES);
    for (const r of rows) {
      if (r.status === 'delivered') {
        agg.delivered = {
          count: r.count,
          subtotal: r.subtotal,
          discount: r.discount,
          deliveryCharge: r.deliveryCharge,
          productCost: r.productCost,
          courierCost: r.courierCost,
          packagingCost: r.packagingCost,
        };
      } else if (r.status === 'returned') {
        agg.returned = { count: r.count, courierCost: r.courierCost, packagingCost: r.packagingCost, returnCost: r.returnCost };
      } else if (r.status === 'cancelled') {
        agg.cancelled = r.count;
      } else {
        agg.pending += r.count;
      }
    }
    return agg;
  }

  async expenseAggregates(businessId: string, period: Period): Promise<ExpenseAggregates> {
    const rows = await this.prisma.$queryRaw<Array<{ kind: string; amount: number; count: number }>>`
      SELECT ec.kind, coalesce(sum(e.amount), 0)::float8 AS amount, count(*)::int AS count
      FROM expenses e JOIN expense_categories ec ON ec.id = e."categoryId"
      WHERE e."businessId" = ${businessId}::uuid AND e."expenseDate" BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY ec.kind`;
    const agg: ExpenseAggregates = { ...EMPTY_EXPENSE_AGGREGATES };
    for (const r of rows) {
      if (r.kind === 'ads' || r.kind === 'courier' || r.kind === 'other') agg[r.kind] += r.amount;
      agg.count += r.count;
    }
    return agg;
  }

  /** Revenue and costs per day or month, plus expenses per bucket, for the trend chart. */
  async trend(businessId: string, period: Period, interval: 'day' | 'month') {
    const unit = Prisma.raw(`'${interval}'`);
    const [orders, expenses] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: Date; revenue: number; costs: number }>>`
        SELECT date_trunc(${unit}, "orderDate")::date AS bucket,
               coalesce(sum(subtotal - discount + "deliveryCharge") FILTER (WHERE status = 'delivered'), 0)::float8 AS revenue,
               coalesce(sum("productCost" + "courierCost" + "packagingCost") FILTER (WHERE status = 'delivered'), 0)::float8
                 + coalesce(sum("courierCost" + "packagingCost" + "returnCost") FILTER (WHERE status = 'returned'), 0)::float8 AS costs
        FROM orders
        WHERE "businessId" = ${businessId}::uuid AND "orderDate" BETWEEN ${period.from}::date AND ${period.to}::date
          AND status IN ('delivered', 'returned')
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ bucket: Date; amount: number }>>`
        SELECT date_trunc(${unit}, "expenseDate")::date AS bucket, coalesce(sum(amount), 0)::float8 AS amount
        FROM expenses
        WHERE "businessId" = ${businessId}::uuid AND "expenseDate" BETWEEN ${period.from}::date AND ${period.to}::date
        GROUP BY 1`,
    ]);
    return { orders, expenses };
  }

  /**
   * Every line of every delivered order in the period. Product filters are applied
   * after discount allocation, which needs all lines of an order.
   */
  deliveredItems(businessId: string, period: Period): Promise<Array<DeliveredItemRow & { categoryId: string | null }>> {
    return this.prisma.$queryRaw`
      SELECT oi."orderId", o.discount AS "orderDiscount", oi."productId", p.name, p.sku, p."categoryId",
             oi.quantity, oi."lineTotal", oi."unitCost"
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      WHERE o."businessId" = ${businessId}::uuid AND o.status = 'delivered'
        AND o."orderDate" BETWEEN ${period.from}::date AND ${period.to}::date`;
  }

  async returnedUnits(businessId: string, period: Period): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ productId: string; units: number }>>`
      SELECT oi."productId", sum(oi.quantity)::int AS units
      FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."businessId" = ${businessId}::uuid AND o.status = 'returned'
        AND o."orderDate" BETWEEN ${period.from}::date AND ${period.to}::date
      GROUP BY oi."productId"`;
    return new Map(rows.map((r) => [r.productId, r.units]));
  }

  countProductsMissingCost(businessId: string): Promise<number> {
    return this.prisma.product.count({ where: { businessId, costPrice: 0, status: 'active' } });
  }

  async hasAnyOrders(businessId: string): Promise<boolean> {
    return (await this.prisma.order.count({ where: { businessId }, take: 1 })) > 0;
  }
}
