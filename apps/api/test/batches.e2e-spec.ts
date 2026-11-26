import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { todayIn, type BatchDto, type ExpirySummaryDto, type ProductDto } from '@ph/shared';
import type { PrismaService } from '../src/common/prisma.service';
import { Client, createTestApp, registerSeller, tk } from './helpers';

/** Spec 2026-11-25 §5.4 and owner decision 2: batches, expiry and Clear stock. */
describe('Batches and expiry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: Client;
  const today = todayIn('Asia/Dhaka');
  const month = today.slice(0, 7);
  const product = async (id: string) => (await seller.get(`/products/${id}`)).body.data as ProductDto;
  const create = async (body: object) => (await seller.send('post', '/products', body)).body.data as ProductDto;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    seller = await registerSeller(app, 'batches@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses anonymous requests', async () => {
    const anon = new Client(app);
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await anon.send('post', `/products/${id}/batches`, {})).status).toBe(401);
    expect((await anon.get(`/products/${id}/batches`)).status).toBe(401);
    expect((await anon.send('post', `/products/${id}/clear-expired`)).status).toBe(401);
    expect((await anon.get('/products/expiry-summary')).status).toBe(401);
  });

  it('receives stock into batches, listed by expiry (spec 5.4)', async () => {
    const napa = await create({ name: 'Napa 500mg', unit: 'strip', tracksBatches: true, sellingPrice: tk(12), costPrice: 950 });
    expect(napa).toMatchObject({ tracksBatches: true, stock: 0, expiredStock: 0, expiredCost: 0 });
    const later = await seller.send('post', `/products/${napa.id}/batches`, {
      batchNo: 'NP2611',
      expiresOn: '2099-06-30',
      quantity: 200,
      unitCost: 950,
    });
    expect(later.status).toBe(201);
    expect(Object.keys(later.body.data).sort()).toEqual(
      ['batchNo', 'expired', 'expiresInDays', 'expiresOn', 'id', 'quantity', 'receivedOn', 'unitCost', 'variantId', 'variantLabel'].sort(),
    );
    await seller.send('post', `/products/${napa.id}/batches`, { batchNo: 'NP2604', expiresOn: '2099-01-31', quantity: 120, unitCost: 920 });

    const batches = (await seller.get(`/products/${napa.id}/batches`)).body.data as BatchDto[];
    expect(batches.map((b) => [b.batchNo, b.quantity, b.expired])).toEqual([
      ['NP2604', 120, false],
      ['NP2611', 200, false],
    ]);
    expect((await product(napa.id)).stock).toBe(320);
    // The latest cost received becomes the product's cost from today.
    expect((await product(napa.id)).costPrice).toBe(920);
  });

  it('the product form never sets the stock of a tracked product (only batches, orders and Clear stock do)', async () => {
    const p = await create({ name: 'ORS Saline', tracksBatches: true, sellingPrice: tk(6), costPrice: 400, stock: 99 });
    expect(p.stock).toBe(0);
    await seller.send('post', `/products/${p.id}/batches`, { expiresOn: '2099-01-01', quantity: 50, unitCost: 400 });
    const res = await seller.send('patch', `/products/${p.id}`, { name: 'ORS Saline 500ml', stock: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'ORS Saline 500ml', stock: 50 });
  });

  it('refuses stock into batches for a product that does not track them', async () => {
    const box = await create({ name: 'Gift Box', sellingPrice: tk(350), costPrice: tk(120) });
    const res = await seller.send('post', `/products/${box.id}/batches`, { expiresOn: '2099-01-01', quantity: 5, unitCost: 100 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('batches_not_tracked');
  });

  it('a product with options needs the variant', async () => {
    const lipstick = await create({
      name: 'Matte Lipstick',
      tracksBatches: true,
      options: [{ name: 'Shade', values: ['Ruby 01', 'Nude 05'] }],
      variants: [
        { optionValues: { Shade: 'Ruby 01' }, sellingPrice: tk(650), costPrice: tk(380) },
        { optionValues: { Shade: 'Nude 05' }, sellingPrice: tk(650), costPrice: tk(380) },
      ],
    });
    const missing = await seller.send('post', `/products/${lipstick.id}/batches`, {
      expiresOn: '2099-03-31',
      quantity: 20,
      unitCost: tk(380),
    });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('variant_required');
    const ruby = lipstick.variants[0];
    const ok = await seller.send('post', `/products/${lipstick.id}/batches`, {
      variantId: ruby.id,
      batchNo: 'RB2405',
      expiresOn: '2099-03-31',
      quantity: 20,
      unitCost: tk(380),
    });
    expect(ok.body.data).toMatchObject({ variantLabel: 'Ruby 01', quantity: 20 });
    expect((await product(lipstick.id)).variants[0].stock).toBe(20);
  });

  describe('expired stock', () => {
    let ace: ProductDto;

    beforeAll(async () => {
      ace = await create({ name: 'Ace 500mg', unit: 'strip', tracksBatches: true, sellingPrice: tk(10), costPrice: 800 });
      await seller.send('post', `/products/${ace.id}/batches`, { batchNo: 'AC2510', expiresOn: '2026-10-31', quantity: 60, unitCost: 800 });
      await seller.send('post', `/products/${ace.id}/batches`, { batchNo: 'AC2701', expiresOn: '2099-01-31', quantity: 40, unitCost: 800 });
    });

    it('marks the expired part on the product, the list filter and the summary', async () => {
      const p = await product(ace.id);
      expect(p).toMatchObject({ stock: 100, expiredStock: 60, expiredCost: 48000 });
      expect(p.variants[0].expiredStock).toBe(60);
      const expired = (await seller.get('/products?expiry=expired')).body.data as ProductDto[];
      expect(expired.map((x) => x.name)).toEqual(['Ace 500mg']);
      const summary = (await seller.get('/products/expiry-summary')).body.data as ExpirySummaryDto;
      expect(summary.expired).toEqual({ batches: 1, products: 1, cost: 48000 });
      const batch = ((await seller.get(`/products/${ace.id}/batches`)).body.data as BatchDto[])[0];
      expect(batch).toMatchObject({ batchNo: 'AC2510', expired: true });
      expect(batch.expiresInDays).toBeLessThan(0);
    });

    it('Clear stock removes only the expired part and books its cost as a loss this month', async () => {
      const before = (await seller.get(`/profit/summary?from=${month}-01&to=${today}`)).body.data.statement.otherExpenses as number;
      const res = await seller.send('post', `/products/${ace.id}/clear-expired`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ quantity: 60, cost: 48000 });

      const p = await product(ace.id);
      expect(p).toMatchObject({ stock: 40, expiredStock: 0, expiredCost: 0 });
      expect(((await seller.get(`/products/${ace.id}/batches`)).body.data as BatchDto[]).map((b) => b.batchNo)).toEqual(['AC2701']);
      const after = (await seller.get(`/profit/summary?from=${month}-01&to=${today}`)).body.data.statement.otherExpenses as number;
      expect(after - before).toBe(48000);
      const writeOffs = await prisma.stockWriteOff.findMany({ where: { productId: ace.id } });
      expect(writeOffs).toHaveLength(1);
      expect(writeOffs[0]).toMatchObject({ batchNo: 'AC2510', quantity: 60, cost: 48000 });
      const expense = await prisma.expense.findUniqueOrThrow({ where: { id: writeOffs[0].expenseId! }, include: { category: true } });
      expect(expense).toMatchObject({ amount: 48000, category: { name: 'Expired stock', kind: 'other' } });
    });

    it('clearing twice clears once', async () => {
      const [a, b] = await Promise.all([
        seller.send('post', `/products/${ace.id}/clear-expired`),
        seller.send('post', `/products/${ace.id}/clear-expired`),
      ]);
      expect([a.body.data, b.body.data]).toEqual([
        { quantity: 0, cost: 0 },
        { quantity: 0, cost: 0 },
      ]);
      expect(await prisma.stockWriteOff.count({ where: { productId: ace.id } })).toBe(1);
    });
  });

  it("never touches another business's batches", async () => {
    const own = await create({ name: 'Secret Syrup', tracksBatches: true, sellingPrice: tk(90), costPrice: tk(60) });
    await seller.send('post', `/products/${own.id}/batches`, { expiresOn: '2020-01-01', quantity: 5, unitCost: tk(60) });
    const intruder = await registerSeller(app, 'batches-intruder@example.com');
    expect((await intruder.get(`/products/${own.id}/batches`)).status).toBe(404);
    expect((await intruder.send('post', `/products/${own.id}/batches`, { expiresOn: '2099-01-01', quantity: 5, unitCost: 1 })).status).toBe(
      404,
    );
    expect((await intruder.send('post', `/products/${own.id}/clear-expired`)).status).toBe(404);
    expect((await intruder.get('/products/expiry-summary')).body.data.expired).toEqual({ batches: 0, products: 0, cost: 0 });
    expect((await product(own.id)).expiredStock).toBe(5);
  });
});
