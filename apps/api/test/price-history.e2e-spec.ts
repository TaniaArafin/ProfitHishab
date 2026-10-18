import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { todayIn } from '@ph/shared';
import type { PrismaService } from '../src/common/prisma.service';
import { type Client, createTestApp, registerSeller, tk } from './helpers';

/** A price change applies from its day on; every order is priced as of its own order date. */
describe('Product price history (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: Client;
  let productId: string;
  const today = todayIn('Asia/Dhaka');

  const order = async (orderDate?: string) => {
    const res = await seller.send('post', '/orders', {
      customer: { phone: '01712345678' },
      items: [{ productId, quantity: 1 }],
      ...(orderDate ? { orderDate } : {}),
    });
    expect(res.status).toBe(201);
    return res.body.data.items[0] as { unitPrice: number; unitCost: number };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    seller = await registerSeller(app, 'prices@example.com');
    const p = await seller.send('post', '/products', { name: 'Cotton Saree', sellingPrice: tk(450), costPrice: tk(300) });
    productId = p.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("starts the history at the product's price on the day it is created", async () => {
    const res = await seller.get(`/products/${productId}/prices`);
    expect(res.body.data).toEqual([expect.objectContaining({ sellingPrice: tk(450), costPrice: tk(300), effectiveFrom: today })]);
  });

  it('keeps the last change when the price changes twice on one day, and leaves earlier orders alone', async () => {
    const before = await order();
    await seller.send('patch', `/products/${productId}`, { sellingPrice: tk(480) });
    await seller.send('patch', `/products/${productId}`, { sellingPrice: tk(500), costPrice: tk(320) });

    const history = (await seller.get(`/products/${productId}/prices`)).body.data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ sellingPrice: tk(500), costPrice: tk(320), effectiveFrom: today });

    expect(before).toMatchObject({ unitPrice: tk(450), unitCost: tk(300) });
    expect(await order()).toMatchObject({ unitPrice: tk(500), unitCost: tk(320) });
  });

  describe('with ৳450 from 1 Oct and ৳500 from today', () => {
    beforeAll(async () => {
      // As if the product was created on 1 Oct at ৳450 and repriced today.
      await prisma.productPrice.create({
        data: {
          businessId: (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).businessId,
          productId,
          sellingPrice: tk(450),
          costPrice: tk(300),
          effectiveFrom: new Date('2026-10-01T00:00:00Z'),
        },
      });
    });

    it('prices a backdated order at the price in effect on its order date', async () => {
      expect(await order('2026-10-10')).toMatchObject({ unitPrice: tk(450), unitCost: tk(300) });
    });

    it('uses the first known price for an order dated before the history starts', async () => {
      expect(await order('2026-09-15')).toMatchObject({ unitPrice: tk(450), unitCost: tk(300) });
    });

    it('lists the history newest first and answers what the price was on a day', async () => {
      const history = (await seller.get(`/products/${productId}/prices`)).body.data;
      expect(history.map((h: { effectiveFrom: string }) => h.effectiveFrom)).toEqual([today, '2026-10-01']);

      const on = await seller.get(`/products/prices-on?ids=${productId}&date=2026-10-10`);
      expect(on.body.data).toEqual([{ productId, sellingPrice: tk(450), costPrice: tk(300) }]);
    });

    it('lets the seller override the price on a backdated order', async () => {
      const res = await seller.send('post', '/orders', {
        customer: { phone: '01712345678' },
        items: [{ productId, quantity: 1, unitPrice: tk(430) }],
        orderDate: '2026-10-10',
      });
      expect(res.body.data.items[0]).toMatchObject({ unitPrice: tk(430), unitCost: tk(300) });
    });
  });

  it("does not reveal another business's price history", async () => {
    const intruder = await registerSeller(app, 'prices-intruder@example.com');
    expect((await intruder.get(`/products/${productId}/prices`)).status).toBe(404);
    expect((await intruder.get(`/products/prices-on?ids=${productId}&date=2026-10-10`)).body.data).toEqual([]);
  });
});
