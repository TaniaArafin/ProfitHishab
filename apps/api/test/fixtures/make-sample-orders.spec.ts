import { readSpreadsheet, type SheetData } from '../../src/modules/imports/spreadsheet';
import { dedupeHash, parseRow, type NormalizedRow } from '../../src/modules/imports/rules/row-parse';
import { makeSampleOrders, SAMPLE_HEADERS, SAMPLE_MAPPING, SAMPLE_TOTALS, SEED_ORDER_REFS } from './make-sample-orders';

const ctx = {
  today: '2026-11-11',
  couriers: new Map([
    ['steadfast', 'c-steadfast'],
    ['pathao', 'c-pathao'],
  ]),
};

describe('makeSampleOrders fixture', () => {
  let sheet: SheetData;
  let parsed: ReturnType<typeof parseRow>[];
  let valid: NormalizedRow[];
  beforeAll(async () => {
    sheet = await readSpreadsheet(makeSampleOrders(), 'sample-orders.xlsx');
    parsed = sheet.rows.map((r) => parseRow(r.raw, SAMPLE_MAPPING, ctx));
    valid = parsed.slice(0, SAMPLE_TOTALS.valid).map((p) => {
      if (!p.ok) throw new Error('a row meant to be valid is not');
      return p.value;
    });
  });
  const sum = (f: (v: NormalizedRow) => number) => valid.reduce((acc, v) => acc + f(v), 0);

  it('has 237 data rows under the sample headers, rows 2–238', () => {
    expect(sheet.headers).toEqual([...SAMPLE_HEADERS]);
    expect(sheet.rows).toHaveLength(SAMPLE_TOTALS.rows);
    expect(sheet.rows[0].rowNumber).toBe(2);
    expect(sheet.rows.at(-1)?.rowNumber).toBe(238);
  });

  it('reads the same on every build', async () => {
    expect((await readSpreadsheet(makeSampleOrders(), 'again.xlsx')).rows).toEqual(sheet.rows);
  });

  it('makes 225 valid single-item, delivered October orders with distinct fingerprints', () => {
    expect(valid.every((v) => v.quantity === 1 && v.status === 'delivered' && v.courierId !== null)).toBe(true);
    expect(valid.every((v) => v.discount === 0 && v.deliveryCharge === 0)).toBe(true);
    const dates = valid.map((v) => v.orderDate).sort();
    expect([dates[0], dates.at(-1)]).toEqual([SAMPLE_TOTALS.from, SAMPLE_TOTALS.to]);
    expect(new Set(valid.map(dedupeHash)).size).toBe(225);
    const refs = valid.map((v) => v.externalRef).filter((r) => r !== null);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.filter((r) => (SEED_ORDER_REFS as readonly string[]).includes(r))).toEqual([]);
  });

  it('adds up to sales ৳5,20,000, product cost ৳3,00,000 and courier cost ৳35,000', () => {
    expect(sum((v) => v.quantity * v.unitPrice - v.discount)).toBe(SAMPLE_TOTALS.sales);
    expect(sum((v) => v.quantity * (v.unitCost ?? 0))).toBe(SAMPLE_TOTALS.productCost);
    expect(sum((v) => v.courierCost ?? 0)).toBe(SAMPLE_TOTALS.courierCost);
    expect(SAMPLE_TOTALS).toMatchObject({ sales: 52_000_000, productCost: 30_000_000, courierCost: 3_500_000 });
  });

  it('ends with 5 in-file copies, 3 seeded order IDs and 4 rows with one reason each', () => {
    const tail = parsed.slice(SAMPLE_TOTALS.valid);
    const copies = tail.slice(0, 5).map((p) => (p.ok ? dedupeHash(p.value) : null));
    const validHashes = new Set(valid.filter((v) => v.externalRef === null).map(dedupeHash));
    expect(copies.every((h) => h !== null && validHashes.has(h))).toBe(true);
    expect(tail.slice(5, 8).map((p) => (p.ok ? p.value.externalRef : null))).toEqual([...SEED_ORDER_REFS]);
    expect(tail.slice(8).map((p) => (p.ok ? [] : p.reasons))).toEqual([
      ['phone_invalid'],
      ['product_missing'],
      ['quantity_invalid'],
      ['date_invalid'],
    ]);
  });
});
