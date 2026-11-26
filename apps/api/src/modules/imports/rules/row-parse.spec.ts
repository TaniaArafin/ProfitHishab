import type { ImportMapping } from '@ph/shared';
import { dedupeHash, parseAmount, parseImportDate, parseQuantity, parseRow, parseUnit, rowProblems, type NormalizedRow } from './row-parse';

const ctx = { today: '2026-11-11', couriers: new Map([['pathao', 'courier-1']]) };
const columns = { phone: 'Phone', product: 'Product', quantity: 'Qty', sellingPrice: 'Price' } as const;
const mapping: ImportMapping = { columns: { ...columns }, statuses: {} };
const base = { Phone: '01712345678', Product: 'Saree', Qty: '2', Price: '1250' };

describe('parseAmount', () => {
  it.each([
    ['৳ 1,250', 125000],
    ['1250 Tk', 125000],
    ['১২৫০', 125000],
    ['1250.5', 125050],
    ['-5', null],
    ['abc', null],
    ['', null],
    ['1250/-', 125000],
    ['21474836.47', 2147483647],
    ['21474836.48', null],
  ])('%s -> %s', (cell, expected) => expect(parseAmount(cell)).toBe(expected));
});

describe('parseQuantity', () => {
  it.each([
    ['2', 2],
    ['০৩', 3],
    ['0', null],
    ['1.5', 1.5],
    ['2.125', 2.125],
    ['০.৫', 0.5],
    ['1.2345', null],
    ['-1', null],
    ['', null],
  ])('%s -> %s', (cell, expected) => expect(parseQuantity(cell)).toBe(expected));
});

describe('parseUnit', () => {
  it.each([
    ['kg', 'kg'],
    ['KG', 'kg'],
    ['কেজি', 'kg'],
    ['pcs', 'piece'],
    ['Litre', 'litre'],
    ['ltr', 'litre'],
    ['gm', 'gram'],
    ['ডজন', 'dozen'],
    ['', null],
    ['bucket', null],
  ])('%s -> %s', (cell, expected) => expect(parseUnit(cell)).toBe(expected));
});

describe('variants, units and decimal quantities in a row', () => {
  const vMapping: ImportMapping = {
    columns: { ...columns, size: 'Size', colour: 'Colour', unit: 'Unit' },
    statuses: {},
  };

  it('reads Size and Colour into option values, only for filled cells', () => {
    const r = parseRow({ ...base, Size: ' M ', Colour: 'Red', Unit: '' }, vMapping, ctx);
    expect(r.ok && r.value.optionValues).toEqual({ Size: 'M', Colour: 'Red' });
    const plain = parseRow({ ...base, Size: '', Colour: '', Unit: '' }, vMapping, ctx);
    expect(plain.ok && plain.value.optionValues).toEqual({});
  });

  it('takes 2.5 kg of rice', () => {
    const r = parseRow({ ...base, Product: 'Miniket Rice', Qty: '2.5', Unit: 'kg' }, vMapping, ctx);
    expect(r.ok && r.value).toMatchObject({ quantity: 2.5, unit: 'kg' });
  });

  it('refuses 1.5 of a piece product, by its own unit, the stored unit or the default', () => {
    expect(parseRow({ ...base, Qty: '1.5', Unit: 'pcs' }, vMapping, ctx)).toEqual({ ok: false, reasons: ['quantity_not_whole'] });
    const stored = { ...ctx, unitOf: (ref: { name: string }) => (ref.name === 'Gift Box' ? ('piece' as const) : null) };
    expect(parseRow({ ...base, Product: 'Gift Box', Qty: '1.5' }, mapping, stored)).toEqual({ ok: false, reasons: ['quantity_not_whole'] });
    expect(parseRow({ ...base, Qty: '1.5' }, mapping, { ...ctx, defaultUnit: 'kg' as const }).ok).toBe(true);
  });

  it('warns about a unit it does not know and leaves it out', () => {
    const r = parseRow({ ...base, Unit: 'bucket' }, vMapping, ctx);
    expect(r.ok && r.value.unit).toBeNull();
    expect(r.ok && r.warnings).toContain('unit_unknown');
  });

  it('keeps M and L of one product on the same day apart in the fingerprint', () => {
    const m = parseRow({ ...base, Size: 'M', Colour: '', Unit: '' }, vMapping, ctx);
    const l = parseRow({ ...base, Size: 'L', Colour: '', Unit: '' }, vMapping, ctx);
    if (!m.ok || !l.ok) throw new Error('rows should parse');
    expect(dedupeHash(m.value)).not.toBe(dedupeHash(l.value));
  });
});

describe('parseImportDate', () => {
  it.each([
    ['03/04/2026', '2026-04-03'],
    ['03-04-2026', '2026-04-03'],
    ['2026-04-03', '2026-04-03'],
    ['46115', '2026-04-03'],
    ['31/02/2026', null],
    ['25569', '1970-01-01'],
    ['25568', null],
    ['hello', null],
    ['03/04/26', '2026-04-03'],
    ['3-4-26', '2026-04-03'],
    ['31/02/26', null],
    ['03/04/202', null],
    ['2026/04/03', '2026-04-03'],
    ['2026/4/3', '2026-04-03'],
    ['2026.04.03', '2026-04-03'],
    ['2026/13/03', null],
    ['2026/04-03', null],
  ])('%s -> %s', (cell, expected) => expect(parseImportDate(cell)).toBe(expected));
});

describe('parseRow', () => {
  it('normalises the phone and defaults the optional fields', () => {
    const r = parseRow({ ...base, Phone: '1712345678' }, mapping, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      phone: '01712345678',
      quantity: 2,
      unitPrice: 125000,
      unitCost: null,
      discount: 0,
      deliveryCharge: 0,
      courierCost: null,
      courierId: null,
      paymentMethod: null, // empty: the order takes another row's method, or cash on delivery
      status: 'delivered',
    });
  });

  it('uses today and warns when there is no date', () => {
    const r = parseRow(base, mapping, ctx);
    expect(r.ok && r.value.orderDate).toBe('2026-11-11');
    expect(r.ok && r.warnings).toContain('date_missing');
    expect(r.ok && r.warnings).toContain('cost_missing');
  });

  it('reports every reason in a fixed order', () => {
    const r = parseRow({ Phone: '123', Product: '', Qty: '0', Price: '1' }, mapping, ctx);
    expect(r).toEqual({ ok: false, reasons: ['phone_invalid', 'product_missing', 'quantity_invalid'] });
  });

  it('flags bad price and bad date', () => {
    const m: ImportMapping = { columns: { ...columns, orderDate: 'Date' }, statuses: {} };
    expect(parseRow({ ...base, Price: 'x', Date: '31/02/2026' }, m, ctx)).toEqual({
      ok: false,
      reasons: ['price_invalid', 'date_invalid'],
    });
  });

  it('maps courier, payment, status and money columns', () => {
    const m: ImportMapping = {
      columns: {
        ...columns,
        courier: 'C',
        paymentMethod: 'P',
        status: 'S',
        discount: 'D',
        productCost: 'Cost',
        courierCost: 'CC',
        deliveryCharge: 'DC',
      },
      statuses: { Done: 'delivered', Back: 'returned' },
    };
    const r = parseRow({ ...base, C: 'Pathao', P: 'bKash', S: 'Back', D: '50', Cost: '900', CC: '60', DC: '80' }, m, ctx);
    expect(r.ok && r.value).toMatchObject({
      courierId: 'courier-1',
      paymentMethod: 'bkash',
      status: 'returned',
      discount: 5000,
      unitCost: 90000,
      courierCost: 6000,
      deliveryCharge: 8000,
    });
    const unknown = parseRow({ ...base, C: 'Nobody', P: 'cheque', S: 'RTO' }, m, ctx);
    expect(unknown.ok && unknown.value).toMatchObject({ courierId: null, paymentMethod: 'other', status: 'returned' });
    for (const inherited of ['constructor', 'toString', '__proto__']) {
      const r2 = parseRow({ ...base, S: inherited }, m, ctx);
      expect(r2.ok && r2.value.status).toBe('delivered');
    }
    const fallback = parseRow({ ...base, S: 'hold' }, m, ctx);
    expect(fallback.ok && fallback.value.status).toBe('delivered');
  });
});

describe('dedupeHash', () => {
  const row: NormalizedRow = {
    phone: '01712345678',
    customerName: null,
    address: null,
    orderDate: '2026-04-03',
    externalRef: null,
    sku: null,
    productName: 'Saree',
    optionValues: {},
    unit: null,
    quantity: 1,
    unitPrice: 100,
    unitCost: null,
    discount: 0,
    deliveryCharge: 0,
    courierId: null,
    courierCost: null,
    paymentMethod: 'cod',
    status: 'delivered',
  };
  it('ignores case and spaces around the product', () => {
    expect(dedupeHash(row)).toBe(dedupeHash({ ...row, productName: ' saree ' }));
  });
  it('differs when the price differs', () => {
    expect(dedupeHash(row)).not.toBe(dedupeHash({ ...row, unitPrice: 101 }));
  });
});

describe('rowProblems', () => {
  const full: ImportMapping = {
    columns: { ...columns, orderDate: 'Date', productCost: 'Cost', discount: 'Disc', deliveryCharge: 'Del', courierCost: 'Cour' },
    statuses: {},
  };

  it('is empty for a good row, and treats optional empty cells as fine', () => {
    expect(rowProblems(base, full)).toEqual({});
    expect(rowProblems({ ...base, Date: '', Cost: '', Disc: '', Del: '', Cour: '' }, full)).toEqual({});
  });

  it('names each wrong field with what to enter', () => {
    expect(
      rowProblems(
        { Phone: '123', Product: ' ', Qty: '0', Price: 'x', Date: '31/02/2026', Cost: 'a', Disc: 'b', Del: 'c', Cour: 'd' },
        full,
      ),
    ).toEqual({
      phone: 'Enter a number like 017XXXXXXXX',
      product: 'Enter the product name',
      quantity: 'Enter a number above 0, like 2 or 2.5',
      sellingPrice: 'Enter an amount like 1250',
      orderDate: 'Enter a date like 2026-10-31',
      productCost: 'Enter an amount like 1250',
      discount: 'Enter an amount like 1250',
      deliveryCharge: 'Enter an amount like 1250',
      courierCost: 'Enter an amount like 1250',
    });
  });

  it('never flags a field where parseRow accepts the row', () => {
    const row = { ...base, Date: '05/10/2026', Cost: '৳ 700', Disc: '10', Del: '60 Tk', Cour: '১২০' };
    expect(parseRow(row, full, ctx).ok).toBe(true);
    expect(rowProblems(row, full)).toEqual({});
  });
});
