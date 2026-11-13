import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ProductSearch } from '../src/modules/products/product-search';
import { type Client, createTestApp, registerSeller, tk } from './helpers';

/** Runs against Typesense when TEST_TYPESENSE_URL is set (CI does); otherwise searches use Postgres and this is skipped. */
const withTypesense = process.env.TEST_TYPESENSE_URL ? describe : describe.skip;

withTypesense('Product search on Typesense (e2e)', () => {
  let app: INestApplication;
  let seller: Client;
  const names = async (q: string, who: Client = seller): Promise<string[]> => {
    const res = await who.get(`/products?status=active&q=${encodeURIComponent(q)}`);
    return (res.body.data as Array<{ name: string }>).map((p) => p.name);
  };

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await app.get(ProductSearch).rebuild(); // the database was just truncated; start the index clean too
    seller = await registerSeller(app, 'search@example.com');
    for (const [name, sku] of [
      ['Premium Cotton Saree', 'SAR-0042'],
      ['Silk Saree', 'SAR-0043'],
      ['Leather Bag', 'BAG-0001'],
    ]) {
      await seller.send('post', '/products', { name, sku, sellingPrice: tk(1000), costPrice: tk(500) });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('finds products by the start of a word, forgiving a typo', async () => {
    expect(await names('sar')).toEqual(['Premium Cotton Saree', 'Silk Saree']);
    expect(await names('sareee')).toEqual(['Premium Cotton Saree', 'Silk Saree']);
  });

  it('finds a SKU from any part of it, but exactly', async () => {
    expect(await names('0042')).toEqual(['Premium Cotton Saree']);
    expect(await names('BAG-0001')).toEqual(['Leather Bag']);
    expect(await names('0044')).toEqual([]);
  });

  it('follows renames and archiving straight away', async () => {
    const bag = (await seller.get('/products?q=leather')).body.data[0];
    await seller.send('patch', `/products/${bag.id}`, { name: 'Jute Tote' });
    expect(await names('jute')).toEqual(['Jute Tote']);
    expect(await names('leather')).toEqual([]);

    await seller.send('post', `/products/${bag.id}/archive`);
    expect(await names('jute')).toEqual([]);
  });

  it('drops the products an import created when the import is undone', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Mobile', 'Item', 'Qty', 'Price'],
        ['01712345678', 'Muslin Dupatta', 1, 900],
      ]),
      'Orders',
    );
    const file = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const up = await seller.upload('/imports', 'file', file, 'orders.xlsx');
    const id = up.body.data.id as string;
    await seller.send('put', `/imports/${id}/mapping`, {
      columns: { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' },
    });
    await seller.send('post', `/imports/${id}/validate`);
    expect((await seller.send('post', `/imports/${id}/commit`)).status).toBe(200);
    const businessId = (await seller.get('/auth/me')).body.data.business.id as string;
    const search = app.get(ProductSearch);
    expect(await search.ids(businessId, 'muslin')).toHaveLength(1);

    expect((await seller.send('post', `/imports/${id}/undo`)).body.data.productsDeleted).toBe(1);
    expect(await search.ids(businessId, 'muslin')).toEqual([]); // the index itself, not just the Postgres filter
  });

  it("never returns another business's products", async () => {
    const other = await registerSeller(app, 'search-other@example.com');
    expect(await names('saree', other)).toEqual([]);
  });
});
