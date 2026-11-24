import type { ExpenseReportDto, MonthlyProfitReportDto, ProductProfitReportDto, ProfitKpis, ProfitStatement } from '@ph/shared';

/** A money cell (poisha), a plain number (counts, percentages) or text. */
export type ReportCell = { money: number } | number | string;

/** One report as a table: what the CSV and the .xlsx export both write, so their columns never drift apart. */
export interface ReportTable {
  sheet: string;
  header: string[];
  rows: ReportCell[][];
}

const money = (poisha: number): ReportCell => ({ money: poisha });

const STATEMENT_HEADERS = [
  'Product sales',
  'Delivery income',
  'Revenue',
  'Product cost',
  'Courier cost',
  'Ads cost',
  'Other expenses',
  'Gross profit',
  'Net profit',
  'Margin %',
  'Orders',
  'Delivered',
  'Returned',
  'Return rate %',
];

function statementCells(s: ProfitStatement, k: ProfitKpis): ReportCell[] {
  return [
    ...[
      s.productSales,
      s.deliveryIncome,
      s.revenue,
      s.productCost,
      s.courierCost,
      s.adsCost,
      s.otherExpenses,
      s.grossProfit,
      s.netProfit,
    ].map(money),
    k.profitMargin,
    k.orders,
    k.delivered,
    k.returned,
    k.returnRate,
  ];
}

/** FR-REP-01: one row per month, oldest first, then a Total row. */
export function monthlyProfitTable(report: MonthlyProfitReportDto): ReportTable {
  return {
    sheet: 'Monthly profit',
    header: ['Month', ...STATEMENT_HEADERS],
    rows: [
      ...report.months.map((m) => [m.month, ...statementCells(m.statement, m.kpis)]),
      ['Total', ...statementCells(report.total.statement, report.total.kpis)],
    ],
  };
}

/** FR-REP-03: one row per category with a column per month, then a Total row. */
export function expenseReportTable(report: ExpenseReportDto): ReportTable {
  return {
    sheet: 'Expenses',
    header: ['Category', 'Kind', ...report.months, 'Total'],
    rows: [
      ...report.rows.map((r) => [r.categoryName, r.kind, ...r.amounts.map(money), money(r.total)]),
      ['Total', '', ...report.monthTotals.map(money), money(report.total)],
    ],
  };
}

/** FR-REP-02: the product profitability table. */
export function productProfitTable(report: ProductProfitReportDto): ReportTable {
  return {
    sheet: 'Product profit',
    header: ['Product', 'SKU', 'Units sold', 'Sales', 'Cost', 'Profit', 'Margin %', 'Units returned'],
    rows: report.rows.map((r) => [r.name, r.sku, r.unitsSold, money(r.sales), money(r.cost), money(r.profit), r.margin, r.unitsReturned]),
  };
}
