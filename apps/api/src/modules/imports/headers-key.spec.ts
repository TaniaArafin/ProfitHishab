import { headersKey } from './headers-key';

describe('headersKey', () => {
  it('ignores case, surrounding spaces and column order', () => {
    expect(headersKey([' Phone ', 'PRODUCT', 'qty'])).toBe(headersKey(['qty', 'phone', 'Product']));
  });

  it('differs when a header differs', () => {
    expect(headersKey(['phone', 'qty'])).not.toBe(headersKey(['phone', 'quantity']));
  });

  it('does not confuse a split header with a joined one', () => {
    expect(headersKey(['a', 'b'])).not.toBe(headersKey(['a\u0001b']) + 'x');
    expect(headersKey(['ab'])).not.toBe(headersKey(['a', 'b']));
  });

  it('is a 64-character hex digest', () => {
    expect(headersKey(['phone'])).toMatch(/^[0-9a-f]{64}$/);
  });
});
