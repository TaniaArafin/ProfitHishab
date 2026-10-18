import {
  formatTaka,
  percent,
  type InsightDto,
  type InsightSeverity,
  type ProductProfitDto,
  type ProfitKpis,
  type ProfitStatement,
} from '@ph/shared';

/**
 * The profit engine (SRS section 6). Pure functions over aggregates that the
 * repository reads with SQL. Nothing here touches the database.
 */

export interface OrderAggregates {
  delivered: {
    count: number;
    subtotal: number;
    discount: number;
    deliveryCharge: number;
    productCost: number;
    courierCost: number;
    packagingCost: number;
  };
  returned: { count: number; courierCost: number; packagingCost: number; returnCost: number };
  pending: number;
  cancelled: number;
}

export interface ExpenseAggregates {
  ads: number;
  courier: number;
  other: number;
  count: number;
}

export const EMPTY_ORDER_AGGREGATES: OrderAggregates = {
  delivered: { count: 0, subtotal: 0, discount: 0, deliveryCharge: 0, productCost: 0, courierCost: 0, packagingCost: 0 },
  returned: { count: 0, courierCost: 0, packagingCost: 0, returnCost: 0 },
  pending: 0,
  cancelled: 0,
};

export const EMPTY_EXPENSE_AGGREGATES: ExpenseAggregates = { ads: 0, courier: 0, other: 0, count: 0 };

export function computeStatement(orders: OrderAggregates, expenses: ExpenseAggregates): ProfitStatement {
  const d = orders.delivered;
  const r = orders.returned;

  const productSales = d.subtotal - d.discount;
  const deliveryIncome = d.deliveryCharge;
  const revenue = productSales + deliveryIncome;
  const productCost = d.productCost;
  const courierCost = d.courierCost + d.packagingCost + r.courierCost + r.packagingCost + r.returnCost + expenses.courier;
  const adsCost = expenses.ads;
  const otherExpenses = expenses.other;

  return {
    productSales,
    deliveryIncome,
    revenue,
    productCost,
    courierCost,
    adsCost,
    otherExpenses,
    grossProfit: productSales - productCost,
    netProfit: revenue - productCost - courierCost - adsCost - otherExpenses,
  };
}

export function computeKpis(orders: OrderAggregates, statement: ProfitStatement): ProfitKpis {
  const delivered = orders.delivered.count;
  const returned = orders.returned.count;
  return {
    profitMargin: percent(statement.netProfit, statement.revenue),
    orders: delivered + returned + orders.pending,
    delivered,
    returned,
    pending: orders.pending,
    returnRate: percent(returned, delivered + returned),
    avgOrderValue: delivered === 0 ? 0 : Math.round(statement.revenue / delivered),
  };
}

/** What returned orders cost the seller in the period. */
export function returnLoss(orders: OrderAggregates): number {
  const r = orders.returned;
  return r.courierCost + r.packagingCost + r.returnCost;
}

/**
 * Splits an order-level discount across lines in proportion to line totals
 * (FR-PP-03). Works in whole poisha; the rounding remainder goes to the largest
 * line so the parts always add up to the discount exactly.
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  if (discount === 0 || subtotal === 0 || lineTotals.length === 0) return lineTotals.map(() => 0);

  const parts = lineTotals.map((t) => Math.floor((discount * t) / subtotal));
  const remainder = discount - parts.reduce((a, b) => a + b, 0);
  let largest = 0;
  lineTotals.forEach((t, i) => {
    if (t > lineTotals[largest]) largest = i;
  });
  parts[largest] += remainder;
  return parts;
}

export interface DeliveredItemRow {
  orderId: string;
  orderDiscount: number;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  lineTotal: number;
  unitCost: number;
}

export function productProfitRows(items: DeliveredItemRow[], returnedUnits: Map<string, number>): ProductProfitDto[] {
  const byOrder = new Map<string, DeliveredItemRow[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  const rows = new Map<string, ProductProfitDto>();
  const row = (item: DeliveredItemRow): ProductProfitDto => {
    let r = rows.get(item.productId);
    if (!r) {
      r = {
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        unitsSold: 0,
        sales: 0,
        cost: 0,
        profit: 0,
        margin: 0,
        unitsReturned: 0,
      };
      rows.set(item.productId, r);
    }
    return r;
  };

  for (const lines of byOrder.values()) {
    const discounts = allocateDiscount(
      lines.map((l) => l.lineTotal),
      lines[0].orderDiscount,
    );
    lines.forEach((line, i) => {
      const r = row(line);
      r.unitsSold += line.quantity;
      r.sales += line.lineTotal - discounts[i];
      r.cost += line.quantity * line.unitCost;
    });
  }

  for (const r of rows.values()) {
    r.profit = r.sales - r.cost;
    r.margin = percent(r.profit, r.sales);
    r.unitsReturned = returnedUnits.get(r.productId) ?? 0;
  }

  return [...rows.values()].sort((a, b) => b.profit - a.profit);
}

export function productHighlights(rows: ProductProfitDto[]) {
  const best = (score: (r: ProductProfitDto) => number, pool = rows) =>
    pool.length === 0 ? null : pool.reduce((a, b) => (score(b) > score(a) ? b : a));
  const eligible = rows.filter((r) => r.unitsSold >= 5);
  return {
    mostProfitable: best((r) => r.profit),
    highestRevenue: best((r) => r.sales),
    lowestMargin: best((r) => -r.margin, eligible),
  };
}

export interface InsightInput {
  current: { statement: ProfitStatement; kpis: ProfitKpis; returnLoss: number };
  previous: { statement: ProfitStatement; kpis: ProfitKpis };
  productsMissingCost: number;
  expensesEntered: boolean;
}

const SEVERITY_ORDER: InsightSeverity[] = ['critical', 'warning', 'info', 'good'];

function change(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return percent(current - previous, previous);
}

/** Rule-based dashboard insights (FR-DASH-06), at most three, most severe first. */
export function buildInsights(input: InsightInput, limit = 3): InsightDto[] {
  const { current, previous } = input;
  const out: InsightDto[] = [];

  if (input.productsMissingCost > 0) {
    out.push({
      code: 'missing-cost',
      severity: 'warning',
      message: `${input.productsMissingCost} product${input.productsMissingCost === 1 ? ' has' : 's have'} no cost, so profit is shown higher than it really is.`,
      href: '/products/missing-cost',
    });
  }

  if (current.kpis.returnRate > 10) {
    out.push({
      code: 'return-rate',
      severity: current.kpis.returnRate > 15 ? 'critical' : 'warning',
      message: `Return rate is ${current.kpis.returnRate}%. Returns cost you ${formatTaka(current.returnLoss)} this period.`,
      href: '/orders?status=returned',
    });
  }

  const revenueChange = change(current.statement.revenue, previous.statement.revenue);
  const profitChange = change(current.statement.netProfit, previous.statement.netProfit);
  if (revenueChange !== null && profitChange !== null && revenueChange > 0 && profitChange < 0) {
    out.push({
      code: 'profit-down-revenue-up',
      severity: 'critical',
      message: `Revenue rose ${revenueChange}% but net profit fell ${Math.abs(profitChange)}%.`,
      href: null,
    });
  }

  const adsChange = change(current.statement.adsCost, previous.statement.adsCost);
  if (adsChange !== null && adsChange > 20) {
    out.push({
      code: 'ads-up',
      severity: 'warning',
      message: `Ad spend is up ${adsChange}% on the previous period.`,
      href: '/expenses',
    });
  }

  if (!input.expensesEntered && current.kpis.orders > 0) {
    out.push({
      code: 'no-expenses',
      severity: 'info',
      message: 'No expenses entered for this period. Add your Facebook ad spend to see your real profit.',
      href: '/expenses',
    });
  }

  if (profitChange !== null && profitChange > 10) {
    out.push({
      code: 'profit-up',
      severity: 'good',
      message: `Net profit is up ${profitChange}% on the previous period.`,
      href: null,
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)).slice(0, limit);
}
