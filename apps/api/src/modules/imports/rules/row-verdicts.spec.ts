import type { ImportMapping } from '@ph/shared';
import { prepareRows, rowVerdicts } from './row-verdicts';

const mapping: ImportMapping = {
  columns: { externalRef: 'Ref', phone: 'Phone', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' },
  statuses: {},
};
const ctx = { today: '2026-11-11', couriers: new Map<string, string>() };
const row = (rowNumber: number, Ref: string, Phone: string, Qty = '1', Item = 'Saree') => ({
  rowNumber,
  raw: { Ref, Phone, Item, Qty, Price: '1000' },
});
const none = { refs: new Set<string>(), hashes: new Set<string>() };
const brief = (v: ReturnType<typeof rowVerdicts>) => v.results.map((r) => [r.rowNumber, r.status, r.errors.reasons, r.groupKey]);

describe('rowVerdicts', () => {
  it('groups rows by order ID', () => {
    const p = prepareRows([row(2, 'A', '01712345678'), row(3, 'A', '01712345678', '2', 'Hijab'), row(4, '', '01812345678')], mapping, ctx);
    const v = rowVerdicts(p, none);
    expect(brief(v)).toEqual([
      [2, 'valid', [], 'ref:A'],
      [3, 'valid', [], 'ref:A'],
      [4, 'valid', [], 'row:4'],
    ]);
    expect(v.counts).toEqual({ validRows: 3, duplicateRows: 0, invalidRows: 0 });
    expect(v.results[0].normalized).toMatchObject({ phone: '01712345678', quantity: 1, unitPrice: 100000 });
  });

  it('makes a readable row invalid when another row of its order is not, and both rows of a conflict', () => {
    const p = prepareRows(
      [row(2, 'A', '01712345678'), row(3, 'A', '01712345678', '0'), row(4, 'B', '01712345678'), row(5, 'B', '01812345678')],
      mapping,
      ctx,
    );
    expect(brief(rowVerdicts(p, none))).toEqual([
      [2, 'invalid', ['order_row_invalid'], null],
      [3, 'invalid', ['quantity_invalid'], null],
      [4, 'invalid', ['order_conflict'], null],
      [5, 'invalid', ['order_conflict'], null],
    ]);
  });

  it('marks an existing order ID duplicate for the whole group, and fingerprints only rows without one', () => {
    const p = prepareRows(
      [
        row(2, 'A', '01712345678'),
        row(3, 'A', '01712345678', '2'),
        row(4, '', '01812345678'),
        row(5, '', '01912345678'),
        row(6, '', '01912345678'),
      ],
      mapping,
      ctx,
    );
    expect(p.refs).toEqual(['A']);
    expect(p.hashes).toHaveLength(2);
    const v = rowVerdicts(p, { refs: new Set(['A']), hashes: new Set([p.parsed[2].hash ?? '']) });
    expect(brief(v)).toEqual([
      [2, 'duplicate', ['duplicate_ref'], 'ref:A'],
      [3, 'duplicate', ['duplicate_ref'], 'ref:A'],
      [4, 'duplicate', ['duplicate_row'], 'row:4'],
      [5, 'valid', [], 'row:5'],
      [6, 'duplicate', ['duplicate_in_file'], 'row:6'],
    ]);
    expect(v.results.filter((r) => r.status !== 'valid').every((r) => r.normalized === null)).toBe(true);
  });
});
