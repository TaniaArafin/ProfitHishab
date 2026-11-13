import { suggestStatus } from './status-match';

describe('suggestStatus', () => {
  it.each([
    ['RTO', 'returned'],
    ['Paid', 'delivered'],
    ['ডেলিভারড', 'delivered'],
    ['ফেরত', 'returned'],
    ['Cancelled', 'cancelled'],
    ['canceled by customer', 'cancelled'],
    [' In Transit ', 'shipped'],
    ['confirmed', 'confirmed'],
    ['Pending', 'new'],
    ['hold', null],
    ['', null],
  ])('%s -> %s', (value, expected) => {
    expect(suggestStatus(value)).toBe(expected);
  });
});
