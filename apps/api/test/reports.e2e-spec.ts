import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { currentMonthIn, type ExpenseReportDto, type MonthlyProfitReportDto, type ProductProfitReportDto } from '@ph/shared';
import type { Response } from 'supertest';
import * as XLSX from 'xlsx';
import { Client, createTestApp, importSampleOrders, registerSeller, tk } from './helpers';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Reads an .xlsx response body the way Excel would: the first sheet, as rows of values. */
function xlsxRows(res: Response): { sheet: string; rows: unknown[][] } {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe(XLSX_TYPE);
  const book = XLSX.read(res.body as Buffer, { type: 'buffer' });
  const sheet = book.SheetNames[0];
  return { sheet, rows: XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheet], { header: 1 }) };
}

/** supertest only buffers known types; an .xlsx body is collected as raw bytes. */
const binary = (res: Response, done: (err: Error | null, body: Buffer) => void) => {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let sample: Client;
  let other: Client;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    sample = await registerSeller(app, 'sample@reports.test', 'Sample Shop');
    other = await registerSeller(app, 'other@reports.test', 'Other Shop');
    await importSampleOrders(app, sample);
    const categories = (await sample.get('/expense-categories')).body.data as Array<{ id: string; name: string }>;
    const id = (name: string) => categories.find((c) => c.name === name)!.id;
    for (const [name, taka, date] of [
      ['Facebook Ads', 50_000, '2026-10-15'],
      ['Rent', 15_000, '2026-10-15'],
    ] as const) {
      const res = await sample.send('post', '/expenses', { categoryId: id(name), amount: tk(taka), expenseDate: date });
      expect(res.status).toBe(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /reports/monthly-profit', () => {
    const report = async (seller: Client, to: string) => {
      const res = await seller.get(`/reports/monthly-profit?to=${to}`);
      expect(res.status).toBe(200);
      return res.body.data as MonthlyProfitReportDto;
    };

    it('401 without a session', async () => {
      expect((await new Client(app).get('/reports/monthly-profit')).status).toBe(401);
    });

    it('reproduces the SRS reference figures (SRS 11.1 item 5)', async () => {
      const { months } = await report(sample, '2026-10');
      expect(months).toHaveLength(12);
      expect(months[11].month).toBe('2026-10');
      expect(months[11].statement).toMatchObject({
        revenue: 52_000_000,
        productCost: 30_000_000,
        courierCost: 3_500_000,
        adsCost: 5_000_000,
        otherExpenses: 1_500_000,
        netProfit: 12_000_000,
      });
      expect(months[11].kpis.profitMargin).toBe(23.1);
    });

    it('fills empty months with zeros', async () => {
      const { months } = await report(sample, '2026-10');
      expect(months[0].month).toBe('2025-11');
      expect(months[0].statement).toMatchObject({ revenue: 0, netProfit: 0 });
      expect(months[0].kpis.orders).toBe(0);
    });

    it('puts 31 Oct in October and 1 Nov in November', async () => {
      const seller = await registerSeller(app, 'boundary@reports.test', 'Boundary Shop');
      const product = await seller.send('post', '/products', { name: 'Kurti', sellingPrice: tk(1250), costPrice: tk(700), stock: 10 });
      expect(product.status).toBe(201);
      for (const orderDate of ['2026-10-31', '2026-11-01']) {
        const res = await seller.send('post', '/orders', {
          customer: { phone: '01712345678', name: 'Rahima' },
          items: [{ productId: product.body.data.id, quantity: 1 }],
          orderDate,
          status: 'delivered',
        });
        expect(res.status).toBe(201);
      }
      const { months } = await report(seller, '2026-11');
      expect(months.slice(10).map((m) => [m.month, m.kpis.delivered])).toEqual([
        ['2026-10', 1],
        ['2026-11', 1],
      ]);
    });

    it("excludes another business's orders", async () => {
      const { months, total } = await report(other, '2026-10');
      expect(months[11].statement.revenue).toBe(0);
      expect(total.statement.revenue).toBe(0);
    });

    it('has exactly the documented keys', async () => {
      const data = await report(sample, '2026-10');
      expect(Object.keys(data).sort()).toEqual(['months', 'total']);
      expect(Object.keys(data.months[0])).toEqual(['month', 'statement', 'kpis']);
      expect(Object.keys(data.total).sort()).toEqual(['kpis', 'statement']);
    });

    it('defaults to the current month', async () => {
      const res = await other.get('/reports/monthly-profit');
      expect(res.status).toBe(200);
      expect((res.body.data as MonthlyProfitReportDto).months[11].month).toBe(currentMonthIn('Asia/Dhaka'));
    });

    it('exports CSV with a BOM (SRS 11.1 item 10)', async () => {
      const res = await sample.get('/reports/monthly-profit?to=2026-10&format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      expect(res.headers['content-disposition']).toContain('monthly-profit-2026-10.csv');
      expect(res.text.startsWith('\uFEFF')).toBe(true);
      expect(res.text).toContain('2026-10,520000.00');
    });

    it('exports a real Excel workbook with numbers, not text', async () => {
      const res = await sample.get('/reports/monthly-profit?to=2026-10&format=xlsx').buffer(true).parse(binary);
      expect(res.headers['content-disposition']).toContain('monthly-profit-2026-10.xlsx');
      const { sheet, rows } = xlsxRows(res);
      expect(sheet).toBe('Monthly profit');
      expect(rows[0][0]).toBe('Month');
      const october = rows.find((r) => r[0] === '2026-10')!;
      expect(october.slice(3, 4)).toEqual([520000]); // revenue, as a number in taka
      expect(october[9]).toBe(120000); // net profit
      expect(rows[rows.length - 1][0]).toBe('Total');
    });

    it('422 for an unknown format', async () => {
      expect((await sample.get('/reports/monthly-profit?to=2026-10&format=pdf')).status).toBe(422);
    });

    it('422 for a month that does not exist', async () => {
      const res = await sample.get('/reports/monthly-profit?to=2026-13');
      expect(res.status).toBe(422);
      expect(res.body.error.fields.to).toBeDefined();
    });
  });

  describe('GET /reports/expenses', () => {
    let seller: Client;
    beforeAll(async () => {
      seller = await registerSeller(app, 'expenses@reports.test', 'Expense Shop');
      const categories = (await seller.get('/expense-categories')).body.data as Array<{ id: string; name: string }>;
      const id = (name: string) => categories.find((c) => c.name === name)!.id;
      for (const [name, taka, date] of [
        ['Facebook Ads', 50_000, '2026-10-15'],
        ['Rent', 15_000, '2026-10-01'],
        ['Rent', 2_000, '2026-09-30'],
        ['Rent', 9_999, '2025-10-31'], // the month before the window
      ] as const) {
        expect((await seller.send('post', '/expenses', { categoryId: id(name), amount: tk(taka), expenseDate: date })).status).toBe(201);
      }
    });

    it('401 without a session', async () => {
      expect((await new Client(app).get('/reports/expenses')).status).toBe(401);
    });

    it('sums each category per month, largest total first, over the last 12 months only', async () => {
      const res = await seller.get('/reports/expenses?to=2026-10');
      expect(res.status).toBe(200);
      const data = res.body.data as ExpenseReportDto;
      expect(Object.keys(data).sort()).toEqual(['monthTotals', 'months', 'rows', 'total']);
      expect(data.months[0]).toBe('2025-11');
      expect(data.rows.map((r) => r.categoryName)).toEqual(['Facebook Ads', 'Rent']); // no Salary: nothing spent
      expect(Object.keys(data.rows[0]).sort()).toEqual(['amounts', 'categoryId', 'categoryName', 'kind', 'total']);
      expect(data.rows[0]).toMatchObject({ kind: 'ads', total: tk(50_000) });
      expect(data.rows[0].amounts[11]).toBe(tk(50_000));
      const rent = data.rows[1];
      expect([rent.amounts[10], rent.amounts[11], rent.total]).toEqual([tk(2_000), tk(15_000), tk(17_000)]);
      expect(data.monthTotals[11]).toBe(tk(65_000));
      expect(data.total).toBe(tk(67_000));
    });

    it("excludes another business's expenses", async () => {
      const data = (await other.get('/reports/expenses?to=2026-10')).body.data as ExpenseReportDto;
      expect(data.rows).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('exports CSV with a BOM', async () => {
      const res = await seller.get('/reports/expenses?to=2026-10&format=csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('expenses-2026-10.csv');
      expect(res.text.startsWith('\uFEFF')).toBe(true);
      expect(res.text).toContain('Facebook Ads,ads,');
    });
  });

  describe('GET /reports/expenses as Excel', () => {
    it('exports one row per category and a Total row', async () => {
      const seller = await registerSeller(app, 'xlsx-expenses@reports.test', 'Excel Expense Shop');
      const ads = ((await seller.get('/expense-categories')).body.data as Array<{ id: string; name: string }>).find(
        (c) => c.name === 'Facebook Ads',
      )!;
      expect((await seller.send('post', '/expenses', { categoryId: ads.id, amount: tk(50_000), expenseDate: '2026-10-15' })).status).toBe(
        201,
      );
      const res = await seller.get('/reports/expenses?to=2026-10&format=xlsx').buffer(true).parse(binary);
      expect(res.headers['content-disposition']).toContain('expenses-2026-10.xlsx');
      const { sheet, rows } = xlsxRows(res);
      expect(sheet).toBe('Expenses');
      expect(rows[1]).toEqual(['Facebook Ads', 'ads', ...Array<number>(11).fill(0), 50000, 50000]);
      expect(rows[2][0]).toBe('Total');
    });

    it("never includes another business's expenses", async () => {
      const { rows } = xlsxRows(await other.get('/reports/expenses?to=2026-10&format=xlsx').buffer(true).parse(binary));
      expect(rows.map((r) => r[0])).toEqual(['Category', 'Total']);
    });
  });

  describe('GET /reports/product-profit', () => {
    const query = 'from=2026-10-01&to=2026-10-31';

    it('401 without a session', async () => {
      expect((await new Client(app).get(`/reports/product-profit?${query}`)).status).toBe(401);
    });

    it('returns the same table as /profit/products', async () => {
      const [report, page] = await Promise.all([sample.get(`/reports/product-profit?${query}`), sample.get(`/profit/products?${query}`)]);
      expect(report.status).toBe(200);
      expect((report.body.data as ProductProfitReportDto).rows).toEqual(page.body.data.rows);
      expect(report.body.data.rows).toHaveLength(9);
    });

    it('exports CSV: a header and one line per product', async () => {
      const res = await sample.get(`/reports/product-profit?${query}&format=csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('product-profit-2026-10-01-to-2026-10-31.csv');
      expect(res.text.trimEnd().split('\r\n')).toHaveLength(10);
    });

    it('exports Excel: a header and one row per product', async () => {
      const res = await sample.get(`/reports/product-profit?${query}&format=xlsx`).buffer(true).parse(binary);
      expect(res.headers['content-disposition']).toContain('product-profit-2026-10-01-to-2026-10-31.xlsx');
      const { sheet, rows } = xlsxRows(res);
      expect(sheet).toBe('Product profit');
      expect(rows).toHaveLength(10);
      expect(typeof rows[1][3]).toBe('number'); // sales
    });

    it("excludes another business's products", async () => {
      expect((await other.get(`/reports/product-profit?${query}`)).body.data.rows).toEqual([]);
    });
  });
});
