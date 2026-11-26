import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { ProductDto } from '@ph/shared';
import { type Client, createTestApp, registerSeller, tk } from './helpers';

/** Spec 2026-11-25 §5.1, §5.3, §8: orders sell variants; weight units take decimal quantities. */
describe('Orders with variants and decimal quantities (e2e)', () => {
  let app: INestApplication;
  let seller: Client;
  let kurti: ProductDto;
  let rice: ProductDto;
  let giftBox: ProductDto;

  const customer = { phone: '01712345678' };
  const variant = (label: string) => kurti.variants.find((v) => v.label === label)!;
  const product = async (id: string): Promise<ProductDto> => (await seller.get(`/products/${id}`)).body.data as ProductDto;
  const stockOf = async (label: string) => (await product(kurti.id)).variants.find((v) => v.label === label)!.stock;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    seller = await registerSeller(app, 'order-variants@example.com');
    const sizes = ['S', 'M', 'L', 'XL'];
    kurti = (
      await seller.send('post', '/products', {
        name: 'Cotton Kurti',
        sku: 'KUR',
        options: [
          { name: 'Size', values: sizes },
          { name: 'Colour', values: ['Red', 'Blue'] },
        ],
        variants: sizes.flatMap((Size) =>
          ['Red', 'Blue'].map((Colour) => ({
            optionValues: { Size, Colour },
            sellingPrice: Size === 'XL' ? tk(1350) : tk(1250),
            costPrice: Size === 'XL' ? tk(760) : tk(700),
            stock: Size === 'XL' ? 4 : 14,
          })),
        ),
      })
    ).body.data;
    rice = (
      await seller.send('post', '/products', { name: 'Miniket Rice', unit: 'kg', sellingPrice: tk(78), costPrice: tk(66), stock: 250 })
    ).body.data;
    giftBox = (await seller.send('post', '/products', { name: 'Gift Box', sellingPrice: tk(350), costPrice: tk(120), stock: 40 })).body
      .data;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sells two variants of one product (spec 5.1)', async () => {
    const res = await seller.send('post', '/orders', {
      customer,
      items: [
        { variantId: variant('M / Red').id, quantity: 2 },
        { variantId: variant('XL / Red').id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: tk(3850), productCost: tk(2160) });
    expect(res.body.data.items).toEqual([
      expect.objectContaining({
        productId: kurti.id,
        variantLabel: 'M / Red',
        sku: 'KUR-M-RED',
        unit: 'piece',
        quantity: 2,
        lineTotal: tk(2500),
      }),
      expect.objectContaining({ variantLabel: 'XL / Red', sku: 'KUR-XL-RED', unitPrice: tk(1350), unitCost: tk(760) }),
    ]);
    expect(await stockOf('M / Red')).toBe(12);
    expect(await stockOf('XL / Red')).toBe(3);
    expect((await product(kurti.id)).stock).toBe(kurti.stock - 3);
  });

  it('sells 2.5 kg of rice (spec 5.3)', async () => {
    const res = await seller.send('post', '/orders', { customer, items: [{ variantId: rice.variants[0].id, quantity: 2.5 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 2.5, unit: 'kg', lineTotal: tk(195), variantLabel: null });
    expect(res.body.data).toMatchObject({ subtotal: tk(195), productCost: tk(165) });
    expect((await product(rice.id)).stock).toBe(247.5);
  });

  it('stores the rounded line total', async () => {
    const res = await seller.send('post', '/orders', {
      customer,
      items: [{ variantId: rice.variants[0].id, quantity: 0.333, unitPrice: 7777 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].lineTotal).toBe(2590);
    expect(res.body.data.subtotal).toBe(2590);
  });

  it('refuses a decimal quantity for a piece product', async () => {
    const before = (await seller.get('/orders')).body.meta.total;
    const res = await seller.send('post', '/orders', { customer, items: [{ productId: giftBox.id, quantity: 1.5 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('quantity_not_whole');
    expect(res.body.error.message).toContain('Gift Box');
    expect(res.body.error.message).toContain('piece');
    expect(res.body.error.fields).toHaveProperty(['items.0.quantity']);
    expect((await seller.get('/orders')).body.meta.total).toBe(before);
    expect((await product(giftBox.id)).stock).toBe(40);
  });

  it('productId still works for a plain product', async () => {
    const res = await seller.send('post', '/orders', { customer, items: [{ productId: giftBox.id, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0]).toMatchObject({ productId: giftBox.id, variantId: giftBox.variants[0].id, lineTotal: tk(700) });
  });

  it('productId of a multi-variant product is 422 variant_required', async () => {
    const res = await seller.send('post', '/orders', { customer, items: [{ productId: kurti.id, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('variant_required');
    expect(res.body.error.fields).toHaveProperty(['items.0.variantId']);
  });

  it('returning and cancelling restore variant stock', async () => {
    const start = await stockOf('S / Blue');
    const res = await seller.send('post', '/orders', { customer, items: [{ variantId: variant('S / Blue').id, quantity: 3 }] });
    expect(await stockOf('S / Blue')).toBe(start - 3);
    await seller.send('post', `/orders/${res.body.data.id}/status`, { status: 'cancelled' });
    expect(await stockOf('S / Blue')).toBe(start);
  });

  it('editing a line keeps its original price snapshot (matched by variant)', async () => {
    const lRed = variant('L / Red');
    const res = await seller.send('post', '/orders', { customer, items: [{ variantId: lRed.id, quantity: 1 }] });
    // Reprice L / Red, then edit the order: the existing line keeps ৳1,250, a new variant line takes today's price.
    const current = await product(kurti.id);
    await seller.send('patch', `/products/${kurti.id}`, {
      variants: current.variants.map((v) => ({
        id: v.id,
        optionValues: v.optionValues,
        sellingPrice: v.id === lRed.id ? tk(1400) : v.sellingPrice,
        costPrice: v.costPrice,
        stock: v.stock,
      })),
    });
    const edit = await seller.send('patch', `/orders/${res.body.data.id}`, {
      items: [
        { variantId: lRed.id, quantity: 2 },
        { variantId: variant('L / Blue').id, quantity: 1 },
      ],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.items).toEqual([
      expect.objectContaining({ variantId: lRed.id, unitPrice: tk(1250), quantity: 2 }),
      expect.objectContaining({ variantLabel: 'L / Blue', unitPrice: tk(1250) }),
    ]);
  });
  it('product profit breaks the kurti into its variants', async () => {
    const res = await seller.send('post', '/orders', {
      customer,
      orderDate: '2026-09-10',
      status: 'delivered',
      items: [
        { variantId: variant('M / Blue').id, quantity: 2 },
        { variantId: variant('XL / Blue').id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    const rows = (await seller.get('/profit/products?from=2026-09-01&to=2026-09-30')).body.data.rows;
    const row = rows.find((r: { productId: string }) => r.productId === kurti.id);
    expect(row).toMatchObject({ unitsSold: 3, sales: tk(3850), cost: tk(2160), profit: tk(1690) });
    expect(row.variants).toEqual([
      expect.objectContaining({ label: 'M / Blue', unitsSold: 2, sales: tk(2500), cost: tk(1400) }),
      expect.objectContaining({ label: 'XL / Blue', unitsSold: 1, sales: tk(1350), cost: tk(760) }),
    ]);
  });
});
