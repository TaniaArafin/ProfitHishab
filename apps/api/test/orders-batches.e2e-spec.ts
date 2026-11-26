import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { BatchDto, ProductDto } from '@ph/shared';
import { type Client, createTestApp, registerSeller, tk } from './helpers';

/** Spec 2026-11-25 §5.4 and owner decision 2: orders take stock first-expiry-first; expired stock can't be sold. */
describe('Orders take batch stock first-expiry-first (e2e)', () => {
  let app: INestApplication;
  let seller: Client;
  const customer = { phone: '01712345678' };

  const napa = async () => {
    const p = (
      await seller.send('post', '/products', {
        name: `Napa ${Math.random()}`,
        unit: 'strip',
        tracksBatches: true,
        sellingPrice: tk(12),
        costPrice: 950,
      })
    ).body.data as ProductDto;
    await seller.send('post', `/products/${p.id}/batches`, { batchNo: 'NP2611', expiresOn: '2099-06-30', quantity: 200, unitCost: 950 });
    await seller.send('post', `/products/${p.id}/batches`, { batchNo: 'NP2604', expiresOn: '2098-12-31', quantity: 120, unitCost: 920 });
    return p;
  };
  const left = async (p: ProductDto): Promise<Record<string, number>> =>
    Object.fromEntries(
      ((await seller.get(`/products/${p.id}/batches`)).body.data as BatchDto[]).map((b) => [b.batchNo ?? '', b.quantity] as const),
    );
  const stock = async (p: ProductDto) => ((await seller.get(`/products/${p.id}`)).body.data as ProductDto).stock;
  const order = (p: ProductDto, quantity: number) =>
    seller.send('post', '/orders', { customer, items: [{ variantId: p.variants[0].id, quantity }] });

  beforeAll(async () => {
    ({ app } = await createTestApp());
    seller = await registerSeller(app, 'orders-batches@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('sells 150 strips FEFO (spec 5.4)', async () => {
    const p = await napa();
    const res = await order(p, 150);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: tk(1800), productCost: 138900 });
    expect(res.body.data.items[0]).toMatchObject({
      unitCost: 926,
      batches: [
        { batchNo: 'NP2604', expiresOn: '2098-12-31', quantity: 120 },
        { batchNo: 'NP2611', expiresOn: '2099-06-30', quantity: 30 },
      ],
    });
    expect(await left(p)).toEqual({ NP2611: 170 });
    expect(await stock(p)).toBe(170);
  });

  it('cancelling restores the same batches', async () => {
    const p = await napa();
    const res = await order(p, 150);
    await seller.send('post', `/orders/${res.body.data.id}/status`, { status: 'cancelled' });
    expect(await left(p)).toEqual({ NP2604: 120, NP2611: 200 });
    expect(await stock(p)).toBe(320);
  });

  it('returned restores batches', async () => {
    const p = await napa();
    const res = await order(p, 130);
    const id = res.body.data.id;
    await seller.send('post', `/orders/${id}/status`, { status: 'shipped' });
    await seller.send('post', `/orders/${id}/status`, { status: 'returned' });
    expect(await left(p)).toEqual({ NP2604: 120, NP2611: 200 });
  });

  it('editing an order re-allocates batches', async () => {
    const p = await napa();
    const res = await order(p, 100);
    expect(await left(p)).toEqual({ NP2604: 20, NP2611: 200 });
    const edit = await seller.send('patch', `/orders/${res.body.data.id}`, { items: [{ variantId: p.variants[0].id, quantity: 130 }] });
    expect(edit.status).toBe(200);
    expect(await left(p)).toEqual({ NP2611: 190 });
    expect(await stock(p)).toBe(190);
    // The line was on the order already: it keeps its original cost snapshot.
    expect(edit.body.data.items[0]).toMatchObject({ quantity: 130, unitCost: 920 });
    expect(edit.body.data.items[0].batches.map((b: { quantity: number }) => b.quantity)).toEqual([120, 10]);
  });

  it('refuses a product whose stock has all expired', async () => {
    const p = (
      await seller.send('post', '/products', {
        name: 'Ace 500mg',
        unit: 'strip',
        tracksBatches: true,
        sellingPrice: tk(10),
        costPrice: 800,
      })
    ).body.data as ProductDto;
    await seller.send('post', `/products/${p.id}/batches`, { batchNo: 'AC2510', expiresOn: '2020-10-31', quantity: 60, unitCost: 800 });
    const res = await order(p, 1);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('stock_expired');
    expect(res.body.error.fields).toHaveProperty(['items.0.variantId']);
    expect(await stock(p)).toBe(60);

    // Fresh stock arrives: it sells, from the fresh batch only.
    await seller.send('post', `/products/${p.id}/batches`, { batchNo: 'AC2701', expiresOn: '2099-01-31', quantity: 10, unitCost: 820 });
    const ok = await order(p, 4);
    expect(ok.status).toBe(201);
    expect(ok.body.data.items[0]).toMatchObject({ unitCost: 820, batches: [{ batchNo: 'AC2701', quantity: 4 }] });
  });

  it('sells beyond the fresh batches at the product cost', async () => {
    const p = await napa();
    const res = await order(p, 330);
    expect(res.body.data.items[0].batches.map((b: { quantity: number }) => b.quantity)).toEqual([120, 200]);
    // 120 × 920 + 200 × 950 + 10 × 920 (the product's latest cost) = 309,600 → 938.18 → 938
    expect(res.body.data.items[0].unitCost).toBe(938);
    expect(await stock(p)).toBe(-10);
  });

  it('untracked products are unchanged', async () => {
    const box = (await seller.send('post', '/products', { name: 'Gift Box', sellingPrice: tk(350), costPrice: tk(120), stock: 5 })).body
      .data as ProductDto;
    const res = await order(box, 2);
    expect(res.body.data.items[0]).toMatchObject({ unitCost: tk(120), batches: [] });
  });
});
