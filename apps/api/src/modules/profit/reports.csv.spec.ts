import type { ExpenseReportDto, MonthlyProfitReportDto, ProductProfitReportDto, ProfitKpis, ProfitStatement } from '@ph/shared';
import { expenseReportCsv, monthlyProfitCsv, productProfitCsv } from './reports.csv';

const statement = (over: Partial<ProfitStatement> = {}): ProfitStatement => ({
  productSales: 0,
  deliveryIncome: 0,
  revenue: 0,
  productCost: 0,
  courierCost: 0,
  adsCost: 0,
  otherExpenses: 0,
  grossProfit: 0,
  netProfit: 0,
  ...over,
});
const kpis = (over: Partial<ProfitKpis> = {}): ProfitKpis => ({
  profitMargin: 0,
  orders: 0,
  delivered: 0,
  returned: 0,
  pending: 0,
  returnRate: 0,
  avgOrderValue: 0,
  ...over,
});

const lines = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

describe('monthlyProfitCsv', () => {
  const report: MonthlyProfitReportDto = {
    months: [
      { month: '2026-09', statement: statement({ netProfit: -150000 }), kpis: kpis() },
      {
        month: '2026-10',
        statement: statement({ productSales: 52000000, revenue: 52000000, netProfit: 12000000 }),
        kpis: kpis({ profitMargin: 23.1, orders: 225, delivered: 225 }),
      },
    ],
    total: { statement: statement({ revenue: 52000000, netProfit: 11850000 }), kpis: kpis({ orders: 225 }) },
  };

  it('starts with a BOM and has the fixed header', () => {
    const csv = monthlyProfitCsv(report);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(lines(csv)[0]).toBe(
      'Month,Product sales,Delivery income,Revenue,Product cost,Courier cost,Ads cost,Other expenses,Gross profit,Net profit,Margin %,Orders,Delivered,Returned,Return rate %',
    );
  });

  it('writes one line per month in order, then a Total line, amounts in taka', () => {
    const [, sep, oct, total] = lines(monthlyProfitCsv(report));
    expect(sep).toMatch(/^2026-09,0\.00,.*,-1500\.00,0,0,0,0,0$/);
    expect(oct).toBe('2026-10,520000.00,0.00,520000.00,0.00,0.00,0.00,0.00,0.00,120000.00,23.1,225,225,0,0');
    expect(total).toMatch(/^Total,/);
    expect(lines(monthlyProfitCsv(report))).toHaveLength(4);
  });
});

describe('expenseReportCsv', () => {
  const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
  const amounts = (last: number) => [...Array<number>(11).fill(0), last];
  const report: ExpenseReportDto = {
    months,
    rows: [
      { categoryId: 'a', categoryName: 'Facebook Ads', kind: 'ads', amounts: amounts(5000000), total: 5000000 },
      { categoryId: 'b', categoryName: '=SUM(A1)', kind: 'other', amounts: amounts(150000), total: 150000 },
    ],
    monthTotals: amounts(5150000),
    total: 5150000,
  };

  it('has Category, Kind, the 12 months in order and Total', () => {
    expect(lines(expenseReportCsv(report))[0]).toBe(`Category,Kind,${months.join(',')},Total`);
  });

  it('writes one line per category and a Total line', () => {
    const [, ads, , total] = lines(expenseReportCsv(report));
    expect(ads).toBe(`Facebook Ads,ads,${'0.00,'.repeat(11)}50000.00,50000.00`);
    expect(total).toBe(`Total,,${'0.00,'.repeat(11)}51500.00,51500.00`);
  });

  it('escapes formula cells and keeps Bangla', () => {
    expect(lines(expenseReportCsv(report))[2]).toMatch(/^'=SUM\(A1\),other,/);
    const products: ProductProfitReportDto = {
      period: { from: '2026-10-01', to: '2026-10-31' },
      rows: [
        {
          productId: 'p',
          name: 'শাড়ি',
          sku: '+SKU1',
          unitsSold: 3,
          sales: 750000,
          cost: 450000,
          profit: 300000,
          margin: 40,
          unitsReturned: 1,
          unit: 'piece',
          variants: [],
        },
      ],
      highlights: { mostProfitable: null, highestRevenue: null, lowestMargin: null },
    };
    const [header, row] = lines(productProfitCsv(products));
    expect(header).toBe('Product,SKU,Units sold,Sales,Cost,Profit,Margin %,Units returned');
    expect(row).toBe("শাড়ি,'+SKU1,3,7500.00,4500.00,3000.00,40,1");
  });
});
