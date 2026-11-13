import { suggestColumns } from './header-match';

describe('suggestColumns', () => {
  it('maps English headers', () => {
    expect(suggestColumns(['Mobile', 'Item', 'Qty', 'Rate'])).toEqual({
      phone: 'Mobile',
      product: 'Item',
      quantity: 'Qty',
      sellingPrice: 'Rate',
    });
  });

  it('maps Bangla headers', () => {
    expect(suggestColumns(['ফোন', 'পণ্য', 'পরিমাণ', 'দাম'])).toEqual({
      phone: 'ফোন',
      product: 'পণ্য',
      quantity: 'পরিমাণ',
      sellingPrice: 'দাম',
    });
  });

  it('exact matches beat contains-matches', () => {
    expect(suggestColumns(['Courier', 'Courier Cost'])).toEqual({ courier: 'Courier', courierCost: 'Courier Cost' });
    expect(suggestColumns(['Courier Cost', 'Courier'])).toEqual({ courier: 'Courier', courierCost: 'Courier Cost' });
  });

  it('ignores case, spaces, underscores and dashes', () => {
    expect(suggestColumns([' ORDER_ID ', 'Unit-Price'])).toEqual({ externalRef: ' ORDER_ID ', sellingPrice: 'Unit-Price' });
  });

  it('assigns a header that several targets match to exactly one target (the longest synonym)', () => {
    expect(suggestColumns(['Cost Courier'])).toEqual({ courier: 'Cost Courier' });
  });

  it('does not let a short synonym steal a longer phrase', () => {
    expect(suggestColumns(['Courier Cost'])).toEqual({ courierCost: 'Courier Cost' });
    expect(suggestColumns(['Order Number'])).toEqual({ externalRef: 'Order Number' });
    expect(suggestColumns(['Product Code'])).toEqual({ sku: 'Product Code' });
  });

  it('leaves unknown headers out', () => {
    expect(suggestColumns(['Notes', 'Mobile'])).toEqual({ phone: 'Mobile' });
  });
});
