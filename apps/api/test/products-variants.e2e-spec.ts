import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { todayIn, type ProductDto, type VariantDto } from '@ph/shared';
import type { PrismaService } from '../src/common/prisma.service';
import { Client, createTestApp, registerSeller, tk } from './helpers';

/** Spec 2026-11-25 §4, §5.1, §5.6: one product, many variants; a plain product keeps one hidden variant. */
describe('Products with variants (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: Client;
  const today = todayIn('Asia/Dhaka');

  const kurti = (sizes = ['S', 'M', 'L', 'XL']) => {
    const colours = ['Red', 'Blue'];
    return {
      name: 'Cotton Kurti',
      sku: 'KUR',
      options: [
        { name: 'Size', values: sizes },
        { name: 'Colour', values: colours },
      ],
      variants: sizes.flatMap((Size) =>
        colours.map((Colour) => ({
          optionValues: { Size, Colour },
          sellingPrice: Size === 'XL' ? tk(1350) : tk(1250),
          costPrice: Size === 'XL' ? tk(760) : tk(700),
          stock: Size === 'XL' ? 4 : 14,
        })),
      ),
    };
  };

  const create = async (body: object): Promise<ProductDto> => {
    const res = await seller.send('post', '/products', body);
    expect(res.status).toBe(201);
    return res.body.data as ProductDto;
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    seller = await registerSeller(app, 'variants@example.com');
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses anonymous requests', async () => {
    const anon = new Client(app);
    expect((await anon.send('post', '/products', kurti())).status).toBe(401);
    expect((await anon.get('/products/prices-on?variantIds=00000000-0000-4000-8000-000000000000&date=2026-10-01')).status).toBe(401);
  });

  it('creates a plain product from the legacy payload with one hidden variant', async () => {
    const p = await create({ name: 'Gift Box', sellingPrice: tk(350), costPrice: tk(120), stock: 40 });
    expect(p.unit).toBe('piece');
    expect(p.options).toEqual([]);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({ label: '', optionValues: {}, sku: p.sku, sellingPrice: tk(350), costPrice: tk(120), stock: 40 });
    expect(Object.keys(p.variants[0]).sort()).toEqual([
      'costPrice',
      'id',
      'label',
      'optionValues',
      'sellingPrice',
      'sku',
      'status',
      'stock',
    ]);
  });

  it('creates Cotton Kurti with 8 variants (spec 5.1)', async () => {
    const p = await create(kurti());
    expect(p.variants.map((v) => v.label)).toEqual([
      'S / Red',
      'S / Blue',
      'M / Red',
      'M / Blue',
      'L / Red',
      'L / Blue',
      'XL / Red',
      'XL / Blue',
    ]);
    expect(p.variants[0].sku).toBe('KUR-S-RED');
    expect(p.variants[6]).toMatchObject({ sku: 'KUR-XL-RED', sellingPrice: tk(1350), costPrice: tk(760), stock: 4 });
    expect(p.stock).toBe(14 * 6 + 4 * 2);
    expect(p).toMatchObject({ sku: 'KUR', sellingPrice: tk(1250), costPrice: tk(700) });
    const listed = (await seller.get('/products?q=Kurti')).body.data as ProductDto[];
    expect(listed[0].variants).toHaveLength(8);
  });

  it('refuses a taken variant SKU', async () => {
    const body = { ...kurti(['S']), name: 'Linen Kurti', sku: 'LIN' };
    body.variants[1] = { ...body.variants[1], sku: 'KUR-M-RED' } as (typeof body.variants)[number];
    const res = await seller.send('post', '/products', body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('sku_taken');
    expect(res.body.error.fields).toHaveProperty(['variants.1.sku']);

    // A plain product's SKU that another product's variant already uses.
    const plain = await seller.send('post', '/products', { name: 'Scarf', sku: 'KUR-S-BLUE', sellingPrice: 100, costPrice: 50 });
    expect(plain.status).toBe(409);
  });

  it('decimal stock for kg, whole stock for piece', async () => {
    const rice = await create({ name: 'Miniket Rice', unit: 'kg', sellingPrice: tk(78), costPrice: tk(66), stock: 247.5 });
    expect(rice).toMatchObject({ unit: 'kg', stock: 247.5 });
    const res = await seller.send('post', '/products', { name: 'Mug', sellingPrice: 100, costPrice: 50, stock: 2.5 });
    expect(res.status).toBe(422);
    const update = await seller.send('patch', `/products/${rice.id}`, { stock: 100.25 });
    expect(update.body.data.stock).toBe(100.25);
  });

  it('archives a dropped variant that has orders', async () => {
    const p = await create({ ...kurti(), name: 'Silk Kurti', sku: 'SLK' });
    const xlRed = p.variants.find((v) => v.label === 'XL / Red')!;
    const order = await seller.send('post', '/orders', {
      customer: { phone: '01712345678' },
      items: [{ variantId: xlRed.id, quantity: 1 }],
    });
    expect(order.status).toBe(201);

    const without = kurti(['S', 'M', 'L']);
    const res = await seller.send('patch', `/products/${p.id}`, {
      options: without.options,
      variants: p.variants
        .filter((v) => !v.label.startsWith('XL'))
        .map((v) => ({
          id: v.id,
          optionValues: v.optionValues,
          sku: v.sku,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          stock: v.stock,
        })),
    });
    expect(res.status).toBe(200);
    const after = res.body.data as ProductDto;
    const active = after.variants.filter((v) => v.status === 'active');
    expect(active).toHaveLength(6);
    const archived = after.variants.filter((v) => v.status === 'archived');
    expect(archived.map((v) => v.label)).toEqual(['XL / Red']); // XL / Blue had no orders: gone
    expect(await prisma.productVariant.count({ where: { productId: p.id } })).toBe(7);

    const shown = (await seller.get(`/orders/${order.body.data.id}`)).body.data;
    expect(shown.items[0]).toMatchObject({ variantId: xlRed.id, variantLabel: 'XL / Red' });
    // Stock and the product summary count active variants only.
    expect(after.stock).toBe(14 * 6);

    // An archived variant cannot go on a new order.
    const again = await seller.send('post', '/orders', {
      customer: { phone: '01712345678' },
      items: [{ variantId: xlRed.id, quantity: 1 }],
    });
    expect(again.status).toBe(422);
  });

  it("refuses a new variant reusing a dropped variant's SKU, on that row", async () => {
    const p = await create({ ...kurti(['S', 'M']), name: 'Reuse Kurti', sku: 'RUK' });
    const keep = p.variants.filter((v) => v.label.startsWith('S'));
    // M / Red is sold once, so dropping it archives it and it keeps its SKU.
    const mRed = p.variants.find((v) => v.label === 'M / Red')!;
    await seller.send('post', '/orders', { customer: { phone: '01712345678' }, items: [{ variantId: mRed.id, quantity: 1 }] });
    const next = kurti(['S', 'L']);
    const res = await seller.send('patch', `/products/${p.id}`, {
      options: next.options,
      variants: [
        ...keep.map((v) => ({
          id: v.id,
          optionValues: v.optionValues,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          stock: v.stock,
        })),
        { ...next.variants[2], sku: 'RUK-M-RED' },
        next.variants[3],
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.fields).toHaveProperty(['variants.2.sku']);
  });

  it('adds a new value as new variants on update', async () => {
    const p = await create({ ...kurti(['S']), name: 'Cotton Kurta', sku: 'KTA' });
    const next = kurti(['S', 'M']);
    const res = await seller.send('patch', `/products/${p.id}`, {
      options: next.options,
      variants: [
        ...p.variants.map((v) => ({
          id: v.id,
          optionValues: v.optionValues,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          stock: v.stock,
        })),
        ...next.variants.slice(2),
      ],
    });
    expect(res.status).toBe(200);
    expect((res.body.data as ProductDto).variants.map((v) => v.sku)).toEqual(['KTA-S-RED', 'KTA-S-BLUE', 'KTA-M-RED', 'KTA-M-BLUE']);
  });

  it('records price history per variant', async () => {
    const p = await create({ ...kurti(['M']), name: 'Printed Kurti', sku: 'PRK' });
    const mRed = p.variants.find((v) => v.label === 'M / Red')!;
    const res = await seller.send('patch', `/products/${p.id}`, {
      variants: p.variants.map((v) => ({
        id: v.id,
        optionValues: v.optionValues,
        sellingPrice: v.id === mRed.id ? tk(1300) : v.sellingPrice,
        costPrice: v.costPrice,
        stock: v.stock,
      })),
    });
    expect(res.status).toBe(200);
    const history = (await seller.get(`/products/${p.id}/prices`)).body.data as Array<{ variantLabel: string; sellingPrice: number }>;
    expect(history).toHaveLength(2);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId: mRed.id, variantLabel: 'M / Red', sellingPrice: tk(1300), effectiveFrom: today }),
        expect.objectContaining({ variantLabel: 'M / Blue', sellingPrice: tk(1250) }),
      ]),
    );
  });

  it('a legacy price update changes a plain product', async () => {
    const p = await create({ name: 'Hijab', sellingPrice: tk(300), costPrice: tk(150) });
    const res = await seller.send('patch', `/products/${p.id}`, { sellingPrice: tk(320) });
    expect(res.body.data).toMatchObject({ sellingPrice: tk(320) });
    expect(res.body.data.variants[0]).toMatchObject({ sellingPrice: tk(320), costPrice: tk(150) });
  });

  it('refuses a legacy price update on a product with several variants', async () => {
    const p = await create({ ...kurti(['S']), name: 'Kurti Two', sku: 'KT2' });
    const res = await seller.send('patch', `/products/${p.id}`, { sellingPrice: tk(320) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('variant_required');
  });

  it('prices-on by variant', async () => {
    const p = await create({ ...kurti(['S']), name: 'Dated Kurti', sku: 'DTK' });
    const ids = p.variants.map((v: VariantDto) => v.id).join(',');
    const res = await seller.get(`/products/prices-on?variantIds=${ids}&date=${today}`);
    expect(res.body.data).toEqual(
      expect.arrayContaining(p.variants.map((v) => ({ variantId: v.id, productId: p.id, sellingPrice: tk(1250), costPrice: tk(700) }))),
    );
  });

  it("never exposes another business's variants", async () => {
    const p = await create({ ...kurti(['S']), name: 'Owner Kurti', sku: 'OWK' });
    const intruder = await registerSeller(app, 'variants-intruder@example.com');
    expect((await intruder.get(`/products/${p.id}`)).status).toBe(404);
    expect((await intruder.get(`/products/prices-on?variantIds=${p.variants[0].id}&date=${today}`)).body.data).toEqual([]);
    const steal = await intruder.send('post', '/orders', {
      customer: { phone: '01712345678' },
      items: [{ variantId: p.variants[0].id, quantity: 1 }],
    });
    expect(steal.status).toBe(404);
    // The same SKU is free in another business.
    expect((await intruder.send('post', '/products', { name: 'Scarf', sku: 'OWK-S-RED', sellingPrice: 100, costPrice: 50 })).status).toBe(
      201,
    );
  });
});
