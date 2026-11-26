import type { ExpenseReportDto, MonthlyProfitReportDto, ProductProfitReportDto, ProfitKpis, ProfitStatement } from '@ph/shared';
import * as XLSX from 'xlsx';
import { expenseReportXlsx, monthlyProfitXlsx, productProfitXlsx } from './reports.xlsx';

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

/** The only sheet of the workbook, read back the way Excel would. */
function sheetOf(file: Buffer): { name: string; sheet: XLSX.WorkSheet; rows: unknown[][] } {
  const book = XLSX.read(file, { type: 'buffer', cellNF: true, cellStyles: true });
  expect(book.SheetNames).toHaveLength(1);
  const name = book.SheetNames[0];
  const sheet = book.Sheets[name];
  return { name, sheet, rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) };
}

describe('monthlyProfitXlsx', () => {
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

  it('is a real .xlsx workbook with one sheet, the same English header as the CSV, and a Total row', () => {
    const { name, rows } = sheetOf(monthlyProfitXlsx(report));
    expect(name).toBe('Monthly profit');
    expect(rows[0]).toEqual([
      'Month',
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
    ]);
    expect(rows.map((r) => r[0])).toEqual(['Month', '2026-09', '2026-10', 'Total']);
  });

  it('stores money as numbers in taka with a 2-decimal format, so Excel can add them up', () => {
    const { sheet } = sheetOf(monthlyProfitXlsx(report));
    expect(sheet.D3).toMatchObject({ t: 'n', v: 520000, z: '#,##0.00' }); // Oct revenue
    expect(sheet.J2).toMatchObject({ t: 'n', v: -1500 }); // Sep net loss keeps its sign
    expect(sheet.K3).toMatchObject({ t: 'n', v: 23.1 }); // margin %
    expect(sheet.L3).toMatchObject({ t: 'n', v: 225 }); // orders
  });

  it('sets column widths so the headings are readable', () => {
    const { sheet } = sheetOf(monthlyProfitXlsx(report));
    const first = sheet['!cols']?.[0];
    expect(first?.wch ?? first?.width).toBeGreaterThanOrEqual(8);
  });
});

describe('expenseReportXlsx', () => {
  const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
  const amounts = (last: number) => [...Array<number>(11).fill(0), last];
  const report: ExpenseReportDto = {
    months,
    rows: [{ categoryId: 'a', categoryName: '=SUM(A1)', kind: 'other', amounts: amounts(150000), total: 150000 }],
    monthTotals: amounts(150000),
    total: 150000,
  };

  it('has Category, Kind, the 12 months and Total, and keeps a formula-like name as plain text', () => {
    const { name, sheet, rows } = sheetOf(expenseReportXlsx(report));
    expect(name).toBe('Expenses');
    expect(rows[0]).toEqual(['Category', 'Kind', ...months, 'Total']);
    expect(sheet.A2).toMatchObject({ t: 's', v: '=SUM(A1)' });
    expect(sheet.A2.f).toBeUndefined();
    expect(sheet.N2).toMatchObject({ t: 'n', v: 1500, z: '#,##0.00' });
    expect(rows[2][0]).toBe('Total');
  });
});

describe('productProfitXlsx', () => {
  it('writes one row per product with numbers as numbers', () => {
    const report: ProductProfitReportDto = {
      period: { from: '2026-10-01', to: '2026-10-31' },
      rows: [
        {
          productId: 'p',
          name: 'Cotton Saree',
          sku: 'SKU1',
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
    const { name, sheet, rows } = sheetOf(productProfitXlsx(report));
    expect(name).toBe('Product profit');
    expect(rows[0]).toEqual(['Product', 'SKU', 'Units sold', 'Sales', 'Cost', 'Profit', 'Margin %', 'Units returned']);
    expect(rows[1]).toEqual(['Cotton Saree', 'SKU1', 3, 7500, 4500, 3000, 40, 1]);
    expect(sheet.D2).toMatchObject({ t: 'n', z: '#,##0.00' });
    expect(sheet.C2.z).not.toBe('#,##0.00'); // units are counts, not money
  });
});
