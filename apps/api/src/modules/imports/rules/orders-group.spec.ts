import { groupOrders } from './orders-group';
import type { NormalizedRow } from './row-parse';

const row = (over: Partial<NormalizedRow> = {}): NormalizedRow => ({
  phone: '01712345678',
  customerName: null,
  address: null,
  orderDate: '2026-04-03',
  externalRef: null,
  sku: null,
  productName: 'Saree',
  quantity: 1,
  unitPrice: 100000,
  unitCost: null,
  discount: 0,
  deliveryCharge: 0,
  courierId: null,
  courierCost: null,
  paymentMethod: 'cod',
  status: 'delivered',
  ...over,
});

describe('groupOrders', () => {
  it('groups rows sharing an externalRef and takes order fields from the first row', () => {
    const { groups, conflicts } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'A1', discount: 500, deliveryCharge: 6000 }) },
      { rowNumber: 3, value: row({ externalRef: 'A1', productName: 'Shirt', discount: 900, deliveryCharge: 1 }) },
    ]);
    expect(conflicts).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'ref:A1', rowNumbers: [2, 3], discount: 500, deliveryCharge: 6000 });
    expect(groups[0].items).toHaveLength(2);
  });

  it('takes each order-level field from the first row that has it (a discount only on row 2 is kept)', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'A1', paymentMethod: null }) },
      {
        rowNumber: 3,
        value: row({
          externalRef: 'A1',
          discount: 500,
          courierCost: 15000,
          courierId: 'c-1',
          paymentMethod: 'bkash',
          customerName: 'Rina',
        }),
      },
      {
        rowNumber: 4,
        value: row({ externalRef: 'A1', discount: 900, deliveryCharge: 6000, courierCost: 1, courierId: 'c-2', paymentMethod: 'nagad' }),
      },
    ]);
    expect(groups[0]).toMatchObject({
      discount: 500,
      deliveryCharge: 6000,
      courierCost: 15000,
      courierId: 'c-1',
      paymentMethod: 'bkash',
      customerName: 'Rina',
    });
  });

  it('keeps a courier cost of 0 typed on the first row', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'A1', courierCost: 0 }) },
      { rowNumber: 3, value: row({ externalRef: 'A1', courierCost: 15000 }) },
    ]);
    expect(groups[0].courierCost).toBe(0);
  });

  it('defaults an order-level field no row has: cash on delivery, no courier, no charges', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'A1', paymentMethod: null }) },
      { rowNumber: 3, value: row({ externalRef: 'A1', paymentMethod: null }) },
    ]);
    expect(groups[0]).toMatchObject({ discount: 0, deliveryCharge: 0, courierCost: null, courierId: null, paymentMethod: 'cod' });
  });

  it('makes one order per row without a ref', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row() },
      { rowNumber: 3, value: row() },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['row:2', 'row:3']);
  });

  it('puts every row of a disagreeing group in conflicts', () => {
    const { groups, conflicts } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'A2' }) },
      { rowNumber: 3, value: row({ externalRef: 'A2', phone: '01812345678' }) },
      { rowNumber: 4, value: row({ externalRef: 'A3' }) },
    ]);
    expect(conflicts).toEqual([2, 3]);
    expect(groups.map((g) => g.key)).toEqual(['ref:A3']);
  });

  it('conflicts on date and status too', () => {
    expect(
      groupOrders([
        { rowNumber: 2, value: row({ externalRef: 'B' }) },
        { rowNumber: 3, value: row({ externalRef: 'B', orderDate: '2026-04-04' }) },
      ]).conflicts,
    ).toEqual([2, 3]);
    expect(
      groupOrders([
        { rowNumber: 2, value: row({ externalRef: 'C' }) },
        { rowNumber: 3, value: row({ externalRef: 'C', status: 'returned' }) },
      ]).conflicts,
    ).toEqual([2, 3]);
  });

  it('clamps a discount above the subtotal and warns', () => {
    const { groups } = groupOrders([{ rowNumber: 2, value: row({ discount: 999999 }) }]);
    expect(groups[0].discount).toBe(100000);
    expect(groups[0].warnings).toEqual(['discount_clamped']);
  });

  it('keeps a discount within the subtotal', () => {
    const { groups } = groupOrders([{ rowNumber: 2, value: row({ discount: 100000 }) }]);
    expect(groups[0].discount).toBe(100000);
    expect(groups[0].warnings).toEqual([]);
  });

  it('does not clamp a discount between the first line total and the order subtotal', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'D', unitPrice: 100000, discount: 150000 }) },
      { rowNumber: 3, value: row({ externalRef: 'D', unitPrice: 100000, productName: 'Shirt' }) },
    ]);
    expect(groups[0].discount).toBe(150000);
    expect(groups[0].warnings).toEqual([]);
  });

  it('clamps a multi-item discount above the subtotal to the full subtotal', () => {
    const { groups } = groupOrders([
      { rowNumber: 2, value: row({ externalRef: 'E', unitPrice: 100000, discount: 250000 }) },
      { rowNumber: 3, value: row({ externalRef: 'E', unitPrice: 100000, productName: 'Shirt' }) },
    ]);
    expect(groups[0].discount).toBe(200000);
    expect(groups[0].warnings).toEqual(['discount_clamped']);
  });
});
