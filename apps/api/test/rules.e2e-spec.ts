import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { Client, createTestApp, registerSeller, tk } from './helpers';

/**
 * Rules adopted from the laravel-skill set (see CLAUDE.md). Each test names the rule it proves.
 */
describe('Engineering rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  async function sellerWithProduct(email: string, stock = 10) {
    const seller = await registerSeller(app, email);
    const product = await seller.send('post', '/products', { name: 'Premium Saree', sellingPrice: tk(2500), costPrice: tk(1350), stock });
    return { seller, productId: product.body.data.id as string };
  }

  describe('http-assert-payload-shape', () => {
    it('/auth/me exposes exactly the documented keys and never the password hash', async () => {
      const seller = await registerSeller(app, 'shape@example.com');
      const res = await seller.get('/auth/me');
      expect(Object.keys(res.body.data.user).sort()).toEqual(['email', 'id', 'locale', 'name', 'phone']);
      expect(Object.keys(res.body.data.business)).toContain('trialEndsAt');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
    });
  });

  describe('controller-idempotency-key-on-unsafe-writes', () => {
    it('replays the first order for a repeated key and creates only one', async () => {
      const { seller, productId } = await sellerWithProduct('idem@example.com');
      const body = { customer: { phone: '01712345678' }, items: [{ productId, quantity: 1 }] };

      const first = await seller.send('post', '/orders', body, { idempotencyKey: 'retry-key-0001' });
      const retry = await seller.send('post', '/orders', body, { idempotencyKey: 'retry-key-0001' });
      expect(first.status).toBe(201);
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect((await seller.get('/orders')).body.meta.total).toBe(1);
      expect((await seller.get(`/products/${productId}`)).body.data.stock).toBe(9);
    });

    it('refuses a key reused with a different body, and a missing key', async () => {
      const { seller, productId } = await sellerWithProduct('idem2@example.com');
      await seller.send(
        'post',
        '/orders',
        { customer: { phone: '01712345678' }, items: [{ productId, quantity: 1 }] },
        { idempotencyKey: 'retry-key-0002' },
      );

      const reused = await seller.send(
        'post',
        '/orders',
        { customer: { phone: '01712345678' }, items: [{ productId, quantity: 3 }] },
        { idempotencyKey: 'retry-key-0002' },
      );
      expect(reused.status).toBe(409);
      expect(reused.body.error.code).toBe('idempotency_key_reused');

      const missing = await seller.send(
        'post',
        '/orders',
        { customer: { phone: '01712345678' }, items: [{ productId, quantity: 1 }] },
        { idempotencyKey: null },
      );
      expect(missing.status).toBe(400);
    });

    it('lets two businesses use the same key independently', async () => {
      const a = await sellerWithProduct('idem-a@example.com');
      const b = await sellerWithProduct('idem-b@example.com');
      const ra = await a.seller.send(
        'post',
        '/orders',
        { customer: { phone: '01712345678' }, items: [{ productId: a.productId, quantity: 1 }] },
        { idempotencyKey: 'shared-key-0001' },
      );
      const rb = await b.seller.send(
        'post',
        '/orders',
        { customer: { phone: '01712345678' }, items: [{ productId: b.productId, quantity: 1 }] },
        { idempotencyKey: 'shared-key-0001' },
      );
      expect(ra.status).toBe(201);
      expect(rb.status).toBe(201);
      expect(rb.body.data.id).not.toBe(ra.body.data.id);
    });
  });

  describe('tx-lock-for-update-on-contention', () => {
    it('restores stock once when the same order is cancelled twice at the same moment', async () => {
      const { seller, productId } = await sellerWithProduct('race@example.com', 10);
      const order = await seller.send('post', '/orders', { customer: { phone: '01712345678' }, items: [{ productId, quantity: 4 }] });
      expect((await seller.get(`/products/${productId}`)).body.data.stock).toBe(6);

      const results = await Promise.all([
        seller.send('post', `/orders/${order.body.data.id}/status`, { status: 'cancelled' }),
        seller.send('post', `/orders/${order.body.data.id}/status`, { status: 'cancelled' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
      expect((await seller.get(`/products/${productId}`)).body.data.stock).toBe(10);
    });
  });

  describe('db-test-transactions-and-idempotency', () => {
    it('leaves nothing behind when an order fails partway', async () => {
      const { seller, productId } = await sellerWithProduct('rollback@example.com');
      const other = await sellerWithProduct('rollback-other@example.com');

      const res = await seller.send('post', '/orders', {
        customer: { phone: '01999999999', name: 'Should Not Exist' },
        items: [
          { productId, quantity: 2 },
          { productId: other.productId, quantity: 1 },
        ],
      });
      expect(res.status).toBe(404);
      expect((await seller.get('/customers?q=01999999999')).body.meta.total).toBe(0);
      expect((await seller.get(`/products/${productId}`)).body.data.stock).toBe(10);

      // The order number reserved inside the failed transaction was rolled back too.
      const ok = await seller.send('post', '/orders', { customer: { phone: '01712345678' }, items: [{ productId, quantity: 1 }] });
      expect(ok.body.data.orderNo).toBe(1001);
    });
  });

  describe('db-assert-inclusion-and-exclusion / query-whitelist-sortable-columns', () => {
    it('search excludes non-matching products and an unknown sort falls back to name', async () => {
      const seller = await registerSeller(app, 'search@example.com');
      for (const [name, price] of [
        ['Cotton Saree', 2500],
        ['Silk Saree', 4000],
        ['Leather Bag', 900],
      ] as const) {
        await seller.send('post', '/products', { name, sellingPrice: tk(price), costPrice: tk(price / 2) });
      }
      const saree = await seller.get('/products?q=saree');
      expect(saree.body.data.map((p: { name: string }) => p.name)).toEqual(['Cotton Saree', 'Silk Saree']);

      const byPrice = await seller.get('/products?sort=-price');
      expect(byPrice.body.data.map((p: { name: string }) => p.name)).toEqual(['Silk Saree', 'Cotton Saree', 'Leather Bag']);

      const injected = await seller.get(`/products?sort=${encodeURIComponent('name; DROP TABLE products')}`);
      expect(injected.status).toBe(200);
      expect(injected.body.data.map((p: { name: string }) => p.name)).toEqual(['Cotton Saree', 'Leather Bag', 'Silk Saree']);
    });
  });

  describe('FR-AUTH-08 login limits', () => {
    // Order matters: the lockout test below also locks this test client's IP (all requests come from 127.0.0.1).
    it('never counts successful logins', async () => {
      await registerSeller(app, 'busy@example.com');
      for (let i = 0; i < 8; i++) {
        const res = await new Client(app).send('post', '/auth/login', { identifier: 'busy@example.com', password: 'secret-pass-1' });
        expect(res.status).toBe(200);
      }
    });
    it('blocks an account after 5 failed logins, even with the right password', async () => {
      await registerSeller(app, 'locked@example.com');
      const client = new Client(app);
      for (let i = 0; i < 5; i++) {
        expect((await client.send('post', '/auth/login', { identifier: 'locked@example.com', password: 'wrong-password' })).status).toBe(
          401,
        );
      }
      const blocked = await client.send('post', '/auth/login', { identifier: 'locked@example.com', password: 'secret-pass-1' });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.message).toMatch(/^Too many failed attempts\. Try again in \d+ minutes?\.$/);
    });
  });

  describe('nodebestpractices 5.14 / 6.14', () => {
    it('tags every response with a request id, keeping a valid incoming one', async () => {
      const seller = await registerSeller(app, 'reqid@example.com');
      const generated = await seller.get('/auth/me');
      expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const echoed = await seller.get('/auth/me').set('x-request-id', 'trace-abc-12345');
      expect(echoed.headers['x-request-id']).toBe('trace-abc-12345');
    });

    it('refuses a JSON body over the size limit with 413, not 500', async () => {
      const seller = await registerSeller(app, 'bigbody@example.com');
      const res = await seller.send('post', '/products', { name: 'x'.repeat(300 * 1024), sellingPrice: 100, costPrice: 50 });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('payload_too_large');
    });
  });

  describe('model-cast-every-column (CHECK constraints)', () => {
    it('the database itself refuses an unknown order status', async () => {
      const { seller, productId } = await sellerWithProduct('check@example.com');
      const order = await seller.send('post', '/orders', { customer: { phone: '01712345678' }, items: [{ productId, quantity: 1 }] });
      await expect(prisma.$executeRaw`UPDATE orders SET status = 'lost-in-transit' WHERE id = ${order.body.data.id}::uuid`).rejects.toThrow(
        /orders_status_check/,
      );
    });
  });
});
