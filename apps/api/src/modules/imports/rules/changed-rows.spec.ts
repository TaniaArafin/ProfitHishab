import { changedRows } from './changed-rows';

const stored = (over: object = {}) => ({
  rowNumber: 2,
  status: 'valid',
  groupKey: 'ref:A-1',
  normalized: { quantity: 1, phone: '01712345678', items: [{ b: 2, a: 1 }] },
  errors: { reasons: [], warnings: ['cost_missing'] },
  ...over,
});
const result = (over: object = {}) => ({
  rowNumber: 2,
  status: 'valid' as const,
  groupKey: 'ref:A-1',
  normalized: { phone: '01712345678', quantity: 1, items: [{ a: 1, b: 2 }] },
  errors: { warnings: ['cost_missing'], reasons: [] },
  ...over,
});

describe('changedRows', () => {
  it('skips a row whose verdict is the same, whatever order the stored JSON keys came back in', () => {
    expect(changedRows([stored()], [result()])).toEqual([]);
  });

  it.each([
    ['status', { status: 'invalid' }],
    ['group', { groupKey: 'hash:x' }],
    ['normalised value', { normalized: { phone: '01912345678', quantity: 1, items: [{ a: 1, b: 2 }] } }],
    ['errors', { errors: { reasons: ['phone_invalid'], warnings: [] } }],
    ['a value that became empty', { normalized: null }],
  ])('keeps a row whose %s changed', (_, over) => {
    expect(changedRows([stored()], [result(over)])).toHaveLength(1);
  });

  it('keeps a row that has no stored verdict yet', () => {
    expect(changedRows([], [result()])).toHaveLength(1);
  });

  it('keeps array order meaningful', () => {
    expect(
      changedRows([stored({ errors: { reasons: ['a', 'b'], warnings: [] } })], [result({ errors: { reasons: ['b', 'a'], warnings: [] } })]),
    ).toHaveLength(1);
  });
});
