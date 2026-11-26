import {
  allocateDiscount,
  buildInsights,
  computeKpis,
  computeStatement,
  EMPTY_EXPENSE_AGGREGATES,
  EMPTY_ORDER_AGGREGATES,
  productHighlights,
  productProfitRows,
  type DeliveredItemRow,
  type OrderAggregates,
} from './profit.calculator';

const tk = (taka: number) => taka * 100;

/** The reference dashboard from the SRS: ৳5,20,000 revenue, ৳1,20,000 net profit, 23.1%. */
const reference: OrderAggregates = {
  delivered: {
    count: 360,
    subtotal: tk(500_000),
    discount: tk(10_000),
    deliveryCharge: tk(30_000),
    productCost: tk(300_000),
    courierCost: tk(25_000),
    packagingCost: tk(4_000),
  },
  returned: { count: 60, courierCost: tk(3_000), packagingCost: tk(1_000), returnCost: tk(2_000) },
  pending: 0,
  cancelled: 12,
};

describe('computeStatement', () => {
  it('reproduces the SRS reference dashboard', () => {
    const s = computeStatement(reference, { ads: tk(50_000), courier: 0, other: tk(15_000), count: 3 });
    expect(s.revenue).toBe(tk(520_000));
    expect(s.productCost).toBe(tk(300_000));
    expect(s.courierCost).toBe(tk(35_000));
    expect(s.netProfit).toBe(tk(120_000));
    expect(s.grossProfit).toBe(tk(190_000));

    const k = computeKpis(reference, s);
    expect(k.profitMargin).toBe(23.1);
    expect(k.orders).toBe(420);
    expect(k.returnRate).toBe(14.3);
    expect(k.avgOrderValue).toBe(Math.round(tk(520_000) / 360));
  });

  it('counts a returned order only as a loss', () => {
    const orders: OrderAggregates = {
      ...EMPTY_ORDER_AGGREGATES,
      returned: { count: 1, courierCost: tk(100), packagingCost: tk(40), returnCost: tk(100) },
    };
    const s = computeStatement(orders, EMPTY_EXPENSE_AGGREGATES);
    expect(s.revenue).toBe(0);
    expect(s.productCost).toBe(0);
    expect(s.netProfit).toBe(-tk(240));
  });

  it('adds courier-kind expenses to courier cost, not to other expenses', () => {
    const s = computeStatement(EMPTY_ORDER_AGGREGATES, { ads: 0, courier: tk(500), other: 0, count: 1 });
    expect(s.courierCost).toBe(tk(500));
    expect(s.otherExpenses).toBe(0);
  });

  it('returns zero ratios when there is no revenue', () => {
    const s = computeStatement(EMPTY_ORDER_AGGREGATES, EMPTY_EXPENSE_AGGREGATES);
    expect(computeKpis(EMPTY_ORDER_AGGREGATES, s)).toMatchObject({ profitMargin: 0, returnRate: 0, avgOrderValue: 0 });
  });
});

describe('allocateDiscount', () => {
  it('splits proportionally and always sums exactly', () => {
    const parts = allocateDiscount([1000, 2000, 3001], 1000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([166, 333, 501]);
  });

  it('returns zeros without a discount', () => {
    expect(allocateDiscount([500, 700], 0)).toEqual([0, 0]);
  });
});

describe('productProfitRows', () => {
  it('allocates order discounts and sorts by profit', () => {
    const rows = productProfitRows(
      [
        {
          orderId: 'o1',
          orderDiscount: tk(300),
          productId: 'saree',
          name: 'Saree',
          sku: 'S',
          variantId: 'saree-v',
          variantLabel: null,
          unit: 'piece',
          quantity: 1,
          lineTotal: tk(2500),
          unitCost: tk(1350),
        },
        {
          orderId: 'o1',
          orderDiscount: tk(300),
          productId: 'bag',
          name: 'Bag',
          sku: 'B',
          variantId: 'bag-v',
          variantLabel: null,
          unit: 'piece',
          quantity: 1,
          lineTotal: tk(500),
          unitCost: tk(200),
        },
        {
          orderId: 'o2',
          orderDiscount: 0,
          productId: 'bag',
          name: 'Bag',
          sku: 'B',
          variantId: 'bag-v',
          variantLabel: null,
          unit: 'piece',
          quantity: 2,
          lineTotal: tk(1000),
          unitCost: tk(200),
        },
      ],
      new Map([['bag', 1]]),
    );
    const saree = rows.find((r) => r.productId === 'saree')!;
    const bag = rows.find((r) => r.productId === 'bag')!;
    expect(saree.sales).toBe(tk(2250));
    expect(saree.profit).toBe(tk(900));
    expect(bag).toMatchObject({ unitsSold: 3, sales: tk(1450), cost: tk(600), profit: tk(850), unitsReturned: 1 });
    expect(rows[0].productId).toBe('saree');

    const h = productHighlights(rows);
    expect(h.mostProfitable?.productId).toBe('saree');
    expect(h.lowestMargin).toBeNull();
  });
});

describe('productProfitRows with variants', () => {
  const line = (o: Partial<DeliveredItemRow>): DeliveredItemRow => ({
    orderId: 'o1',
    orderDiscount: 0,
    productId: 'kurti',
    variantId: 'm-red',
    variantLabel: 'M / Red',
    name: 'Cotton Kurti',
    sku: 'KUR',
    unit: 'piece',
    quantity: 2,
    lineTotal: tk(2500),
    unitCost: tk(700),
    ...o,
  });

  it('breaks one product into its variants (spec 5.1)', () => {
    const [kurti] = productProfitRows(
      [line({}), line({ variantId: 'xl-red', variantLabel: 'XL / Red', quantity: 1, lineTotal: tk(1350), unitCost: tk(760) })],
      new Map(),
    );
    expect(kurti).toMatchObject({ unitsSold: 3, sales: tk(3850), cost: tk(2160), profit: tk(1690), unit: 'piece' });
    expect(kurti.variants).toEqual([
      { variantId: 'm-red', label: 'M / Red', unitsSold: 2, sales: tk(2500), cost: tk(1400), profit: tk(1100), margin: 44 },
      { variantId: 'xl-red', label: 'XL / Red', unitsSold: 1, sales: tk(1350), cost: tk(760), profit: tk(590), margin: 43.7 },
    ]);
  });

  it('a plain product has no variant breakdown', () => {
    const [box] = productProfitRows([line({ variantLabel: null, productId: 'box', variantId: 'box-v' })], new Map());
    expect(box.variants).toEqual([]);
  });

  it('rounds a decimal line cost to whole poisha', () => {
    const [rice] = productProfitRows(
      [line({ variantLabel: null, unit: 'kg', quantity: 0.333, lineTotal: 2590, unitCost: 6000 })],
      new Map(),
    );
    expect(rice.cost).toBe(1998);
    expect(rice.unitsSold).toBe(0.333);
  });
});

describe('buildInsights', () => {
  const statement = computeStatement(reference, { ads: tk(50_000), courier: 0, other: tk(15_000), count: 3 });
  const kpis = computeKpis(reference, statement);

  it('flags a high return rate as critical and puts it first', () => {
    const insights = buildInsights({
      current: { statement, kpis: { ...kpis, returnRate: 18 }, returnLoss: tk(6_000) },
      previous: { statement, kpis },
      productsMissingCost: 4,
      expensesEntered: true,
    });
    expect(insights[0]).toMatchObject({ code: 'return-rate', severity: 'critical' });
    expect(insights.map((i) => i.code)).toContain('missing-cost');
  });

  it('warns when revenue rises but profit falls', () => {
    const prevStatement = { ...statement, revenue: tk(400_000), netProfit: tk(150_000) };
    const insights = buildInsights({
      current: { statement, kpis: { ...kpis, returnRate: 2 }, returnLoss: 0 },
      previous: { statement: prevStatement, kpis },
      productsMissingCost: 0,
      expensesEntered: true,
    });
    expect(insights[0].code).toBe('profit-down-revenue-up');
  });

  it('never returns more than three', () => {
    const insights = buildInsights({
      current: { statement: { ...statement, adsCost: tk(90_000) }, kpis, returnLoss: 0 },
      previous: { statement: { ...statement, revenue: tk(100_000), netProfit: tk(200_000), adsCost: tk(10_000) }, kpis },
      productsMissingCost: 3,
      expensesEntered: false,
    });
    expect(insights).toHaveLength(3);
  });
});
