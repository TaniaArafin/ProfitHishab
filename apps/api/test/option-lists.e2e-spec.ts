import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { OptionListDto } from '@ph/shared';
import { Client, createTestApp, nextPhone, OTP_CODE, registerSeller } from './helpers';

/** Spec 2026-11-25 §7: saved option lists (Settings → Product options), seeded from the business type. */
describe('Option lists (e2e)', () => {
  let app: INestApplication;

  /** Registers with a business type (registerSeller has none). */
  const registerAs = async (businessType: string): Promise<Client> => {
    const client = new Client(app);
    const phone = nextPhone();
    await client.send('post', '/auth/otp', { phone });
    const res = await client.send('post', '/auth/register', {
      name: 'Rina',
      businessName: `${businessType} shop`,
      businessType,
      phone,
      code: OTP_CODE,
      email: `lists-${phone}@test.local`,
      password: 'secret-pass-1',
    });
    expect(res.status).toBe(201);
    return client;
  };

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses anonymous requests', async () => {
    const anon = new Client(app);
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await anon.get('/option-lists')).status).toBe(401);
    expect((await anon.send('post', '/option-lists', { name: 'Size', values: ['S'] })).status).toBe(401);
    expect((await anon.send('patch', `/option-lists/${id}`, { name: 'Size' })).status).toBe(401);
    expect((await anon.send('delete', `/option-lists/${id}`)).status).toBe(401);
  });

  it('a new Clothing seller starts with Size and Colour', async () => {
    const seller = await registerAs('Clothing & fashion');
    const lists = (await seller.get('/option-lists')).body.data as OptionListDto[];
    expect(lists.map((l) => l.name)).toEqual(['Colour', 'Size']);
    expect(lists[1].values).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    expect(Object.keys(lists[0]).sort()).toEqual(['id', 'name', 'values']);
  });

  it('an Other seller starts with none', async () => {
    const seller = await registerAs('Other');
    expect((await seller.get('/option-lists')).body.data).toEqual([]);
  });

  it('creates, renames, edits and deletes a list', async () => {
    const seller = await registerSeller(app, 'lists-crud@example.com');
    const created = await seller.send('post', '/option-lists', { name: ' Shoe size ', values: [' 36', '37', '37', '38 '] });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Shoe size', values: ['36', '37', '38'] });
    const id = created.body.data.id;

    const renamed = await seller.send('patch', `/option-lists/${id}`, { name: 'Shoe', values: ['40', '41'] });
    expect(renamed.body.data).toMatchObject({ id, name: 'Shoe', values: ['40', '41'] });

    expect((await seller.send('post', '/option-lists', { name: 'shoe', values: ['1'] })).body.error.code).toBe('option_list_taken');
    const other = await seller.send('post', '/option-lists', { name: 'Fit', values: ['Slim'] });
    const clash = await seller.send('patch', `/option-lists/${other.body.data.id}`, { name: 'SHOE' });
    expect(clash.status).toBe(409);

    expect((await seller.send('delete', `/option-lists/${id}`)).status).toBe(204);
    expect(((await seller.get('/option-lists')).body.data as OptionListDto[]).map((l) => l.name)).toEqual(['Fit']);
  });

  it('validates names and values', async () => {
    const seller = await registerSeller(app, 'lists-valid@example.com');
    expect((await seller.send('post', '/option-lists', { name: '', values: ['S'] })).status).toBe(422);
    expect((await seller.send('post', '/option-lists', { name: 'Size', values: ['x'.repeat(41)] })).status).toBe(422);
    expect(
      (await seller.send('post', '/option-lists', { name: 'Size', values: Array.from({ length: 51 }, (_, i) => `${i}`) })).status,
    ).toBe(422);
  });

  it("never touches another business's lists", async () => {
    const owner = await registerSeller(app, 'lists-owner@example.com');
    const intruder = await registerSeller(app, 'lists-intruder@example.com');
    const list = await owner.send('post', '/option-lists', { name: 'Secret', values: ['A'] });
    const id = list.body.data.id;
    expect((await intruder.send('patch', `/option-lists/${id}`, { name: 'Mine' })).status).toBe(404);
    expect((await intruder.send('delete', `/option-lists/${id}`)).status).toBe(404);
    expect((await intruder.get('/option-lists')).body.data).toEqual([]);
    // The same name is free in another business.
    expect((await intruder.send('post', '/option-lists', { name: 'Secret', values: ['B'] })).status).toBe(201);
  });
});
