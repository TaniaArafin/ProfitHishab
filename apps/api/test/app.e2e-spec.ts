import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Client, createTestApp, tk } from './helpers';

describe('ProfitHishab API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerSeller(email: string, businessName: string) {
    const client = new Client(app);
    const res = await client.send('post', '/auth/register', { name: 'Nusrat', businessName, email, password: 'secret-pass-1' });
    expect(res.status).toBe(201);
    return client;
  }

  it('registers a seller and seeds couriers and expense categories', async () => {
    const seller = await registerSeller('nusrat@example.com', 'Nusrat Fashion');
    const me = await seller.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.business).toMatchObject({ name: 'Nusrat Fashion', currency: 'BDT', timezone: 'Asia/Dhaka' });

    const couriers = await seller.get('/couriers');
    expect(couriers.body.data.map((c: { name: string }) => c.name)).toEqual(['Pathao', 'Steadfast', 'RedX', 'Other']);
    const categories = await seller.get('/expense-categories');
    expect(categories.body.data).toHaveLength(7);
  });

  it('rejects a duplicate email, a wrong password and an anonymous request', async () => {
    const client = new Client(app);
    const dup = await client.send('post', '/auth/register', {
      name: 'Xavier',
      businessName: 'Other',
      email: 'nusrat@example.com',
      password: 'secret-pass-1',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fields.email).toBeDefined();

    const login = await client.send('post', '/auth/login', { identifier: 'nusrat@example.com', password: 'wrong-password' });
    expect(login.status).toBe(401);
    expect(login.body.error.message).toBe('Email/phone or password is wrong.');

    expect((await new Client(app).get('/orders')).status).toBe(401);
  });

  it('refuses a mutation without the CSRF header', async () => {
    const seller = await registerSeller('csrf@example.com', 'CSRF Shop');
    const res = await seller.send('post', '/products', { name: 'X', sellingPrice: 100, costPrice: 50 }, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_failed');
  });

  describe('order to profit', () => {
    let seller: Client;
    let sareeId: string;
    let orderId: string;

    beforeAll(async () => {
      seller = await registerSeller('flow@example.com', 'Flow Shop');
      await seller.send('patch', '/business', { defaultCourierCost: tk(100), defaultPackagingCost: tk(20), defaultReturnCost: tk(100) });
      const product = await seller.send('post', '/products', {
        name: 'Premium Cotton Saree',
        sellingPrice: tk(2500),
        costPrice: tk(1350),
        stock: 10,
      });
      expect(product.status).toBe(201);
      expect(product.body.data).toMatchObject({ sku: 'PRD-0001', grossProfit: tk(1150), margin: 46 });
      sareeId = product.body.data.id;
    });

    it('validates the phone number', async () => {
      const res = await seller.send('post', '/orders', { customer: { phone: '12345' }, items: [{ productId: sareeId, quantity: 1 }] });
      expect(res.status).toBe(422);
      expect(res.body.error.fields['customer.phone']).toEqual(['Enter a number like 017XXXXXXXX']);
    });

    it('creates an order with snapshots, default costs and reserved stock', async () => {
      const res = await seller.send('post', '/orders', {
        customer: { phone: '+880 1712-345678', name: 'Rahima Akter', address: 'Mirpur 10, Dhaka' },
        items: [{ productId: sareeId, quantity: 2 }],
        discount: tk(300),
        deliveryCharge: tk(120),
        orderDate: '2026-09-15',
        status: 'delivered',
      });
      expect(res.status).toBe(201);
      const order = res.body.data;
      orderId = order.id;
      expect(order).toMatchObject({
        orderNo: 1001,
        subtotal: tk(5000),
        total: tk(4820),
        productCost: tk(2700),
        courierCost: tk(100),
        packagingCost: tk(20),
        profit: tk(4820 - 2700 - 100 - 20),
        customer: { phone: '01712345678', name: 'Rahima Akter' },
      });
      expect(order.items[0]).toMatchObject({ unitPrice: tk(2500), unitCost: tk(1350) });

      const product = await seller.get(`/products/${sareeId}`);
      expect(product.body.data.stock).toBe(8);
    });

    it('reuses the customer by phone and keeps the price snapshot after a price change', async () => {
      await seller.send('patch', `/products/${sareeId}`, { sellingPrice: tk(3000) });
      const res = await seller.send('post', '/orders', {
        customer: { phone: '01712345678', name: 'Someone Else' },
        items: [{ productId: sareeId, quantity: 1 }],
        orderDate: '2026-09-20',
      });
      expect(res.body.data.customer.name).toBe('Rahima Akter');
      expect(res.body.data.items[0].unitPrice).toBe(tk(3000));

      const first = await seller.get(`/orders/${orderId}`);
      expect(first.body.data.items[0].unitPrice).toBe(tk(2500));

      const customer = await seller.get(`/customers/${first.body.data.customer.id}`);
      expect(customer.body.data).toMatchObject({ totalOrders: 2, deliveredOrders: 1, totalSpent: tk(4820) });
    });

    it('calculates the dashboard summary from delivered orders and expenses', async () => {
      const ads = (await seller.get('/expense-categories')).body.data.find((c: { name: string }) => c.name === 'Facebook Ads');
      await seller.send('post', '/expenses', { categoryId: ads.id, amount: tk(500), expenseDate: '2026-09-01' });

      const res = await seller.get('/profit/summary?from=2026-09-01&to=2026-09-30');
      expect(res.status).toBe(200);
      expect(res.body.data.statement).toEqual({
        productSales: tk(4700),
        deliveryIncome: tk(120),
        revenue: tk(4820),
        productCost: tk(2700),
        courierCost: tk(120),
        adsCost: tk(500),
        otherExpenses: 0,
        grossProfit: tk(2000),
        netProfit: tk(1500),
      });
      expect(res.body.data.kpis).toMatchObject({ orders: 2, delivered: 1, pending: 1, returnRate: 0 });

      const products = await seller.get('/profit/products?from=2026-09-01&to=2026-09-30');
      expect(products.body.data.rows[0]).toMatchObject({ unitsSold: 2, sales: tk(4700), cost: tk(2700), profit: tk(2000) });
    });

    it('moves revenue out and return cost in when an order is returned', async () => {
      const returned = await seller.send('post', `/orders/${orderId}/status`, { status: 'returned' });
      expect(returned.status).toBe(200);
      expect(returned.body.data.profit).toBe(-tk(220));

      const summary = await seller.get('/profit/summary?from=2026-09-01&to=2026-09-30');
      expect(summary.body.data.statement).toMatchObject({ revenue: 0, productCost: 0, courierCost: tk(220), netProfit: -tk(720) });
      expect((await seller.get(`/products/${sareeId}`)).body.data.stock).toBe(9);

      const cancel = await seller.send('post', `/orders/${orderId}/status`, { status: 'cancelled' });
      expect(cancel.status).toBe(422);
    });

    it('bulk-updates statuses and reports orders it skipped', async () => {
      const list = await seller.get('/orders');
      const ids = list.body.data.map((o: { id: string }) => o.id);
      const res = await seller.send('post', '/orders/bulk-status', { orderIds: ids, status: 'cancelled' });
      expect(res.body.data.updated).toBe(1);
      expect(res.body.data.skipped).toHaveLength(1);

      const counts = await seller.get('/orders/status-counts');
      expect(counts.body.data).toEqual({ cancelled: 1, returned: 1 });
    });

    it('fills a missing cost from today on, leaving past orders as they were made', async () => {
      const p = await seller.send('post', '/products', { name: 'Leather Bag', sellingPrice: tk(800), costPrice: 0 });
      await seller.send('post', '/orders', {
        customer: { phone: '01812345678' },
        items: [{ productId: p.body.data.id, quantity: 1 }],
        orderDate: '2026-09-25',
        status: 'delivered',
      });
      expect((await seller.get('/products/missing-cost')).body.data).toHaveLength(1);

      const res = await seller.send('patch', '/products/bulk-cost', { items: [{ productId: p.body.data.id, costPrice: tk(300) }] });
      expect(res.body.data).toEqual({ productsUpdated: 1 });
      expect((await seller.get('/products/missing-cost')).body.data).toHaveLength(0);
      const summary = await seller.get('/profit/summary?from=2026-09-01&to=2026-09-30');
      expect(summary.body.data.statement.productCost).toBe(0);
    });
  });

  it("never exposes one business's records to another", async () => {
    const owner = await registerSeller('owner@example.com', 'Owner Shop');
    const intruder = await registerSeller('intruder@example.com', 'Intruder Shop');

    const product = await owner.send('post', '/products', { name: 'Secret Saree', sellingPrice: tk(1000), costPrice: tk(500) });
    const order = await owner.send('post', '/orders', {
      customer: { phone: '01912345678' },
      items: [{ productId: product.body.data.id, quantity: 1 }],
    });

    expect((await intruder.get(`/orders/${order.body.data.id}`)).status).toBe(404);
    expect((await intruder.get(`/products/${product.body.data.id}`)).status).toBe(404);
    expect((await intruder.get(`/customers/${order.body.data.customer.id}`)).status).toBe(404);
    expect((await intruder.send('post', `/orders/${order.body.data.id}/status`, { status: 'cancelled' })).status).toBe(404);
    expect((await intruder.send('patch', `/products/${product.body.data.id}`, { costPrice: 0 })).status).toBe(404);

    const steal = await intruder.send('post', '/orders', {
      customer: { phone: '01912345678' },
      items: [{ productId: product.body.data.id, quantity: 1 }],
    });
    expect(steal.status).toBe(404);

    expect((await intruder.get('/orders')).body.meta.total).toBe(0);
    expect((await intruder.get('/products')).body.meta.total).toBe(0);
    expect((await intruder.get('/customers')).body.meta.total).toBe(0);
  });
});
