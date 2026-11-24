import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { ImportDto, ImportRowDto } from '@ph/shared';
import type { PrismaService } from '../src/common/prisma.service';
import { ImportsRepository } from '../src/modules/imports/imports.repository';
import { Client, createTestApp, registerSeller } from './helpers';

const HEADERS = 'Order ID,Order Date,Phone,Product,Qty,Price,Discount';
const COLUMNS = {
  externalRef: 'Order ID',
  orderDate: 'Order Date',
  phone: 'Phone',
  product: 'Product',
  quantity: 'Qty',
  sellingPrice: 'Price',
  discount: 'Discount',
};
/** Row 2 is fine; row 3 has a bad phone and quantity; row 4 has an unreadable discount. */
const FILE = [
  HEADERS,
  'A-1,2026-10-05,01712345678,Saree,1,1000,',
  'A-2,2026-10-06,12345,Kurti,zero,500,',
  'A-3,2026-10-07,01812345678,Panjabi,1,800,abc',
].join('\n');

type Edited = { import: ImportDto; row: ImportRowDto };

/** Inline fixes on the import preview. */
describe('Editing an import row (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: Client;
  let other: Client;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    seller = await registerSeller(app, 'edit@rows.test', 'Edit Shop');
    other = await registerSeller(app, 'other@rows.test', 'Other Shop');
  });

  afterAll(async () => {
    await app.close();
  });

  async function checked(owner: Client = seller, file = FILE): Promise<string> {
    const up = await owner.upload('/imports', 'file', Buffer.from(file), 'orders.csv');
    expect(up.status).toBe(201);
    const id = up.body.data.id as string;
    expect((await owner.send('put', `/imports/${id}/mapping`, { columns: COLUMNS, statuses: {} })).status).toBe(200);
    expect((await owner.send('post', `/imports/${id}/validate`)).status).toBe(200);
    return id;
  }

  const edit = (id: string, row: number, cells: Record<string, string>, owner: Client = seller) =>
    owner.send('patch', `/imports/${id}/rows/${row}`, { cells });

  const rawOf = async (id: string, rowNumber: number) =>
    (await prisma.importRow.findFirstOrThrow({ where: { importId: id, rowNumber } })).raw as Record<string, string>;

  it('names the wrong field of each invalid row, and nothing on a valid row', async () => {
    const id = await checked();
    const invalid = (await seller.get(`/imports/${id}/rows?status=invalid`)).body.data as ImportRowDto[];
    expect(invalid.map((r) => [r.rowNumber, r.problems])).toEqual([
      [3, { phone: 'Enter a number like 017XXXXXXXX', quantity: 'Enter a whole number of 1 or more' }],
      [4, { discount: 'Enter an amount like 1250' }],
    ]);
    const valid = (await seller.get(`/imports/${id}/rows?status=valid`)).body.data as ImportRowDto[];
    expect(valid[0].problems).toEqual({});
  });

  it('401 without a session, and 404 for another business, leaving the row as it was', async () => {
    const id = await checked();
    expect((await edit(id, 3, { Phone: '01912345678' }, new Client(app))).status).toBe(401);
    const foreign = await edit(id, 3, { Phone: '01912345678' }, other);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('import_not_found');
    expect((await rawOf(id, 3)).Phone).toBe('12345');
  });

  it('fixing the cells moves the row to valid, keeps its other cells and updates the counts', async () => {
    const id = await checked();
    const res = await edit(id, 3, { Phone: '01912345678', Qty: '2' });
    expect(res.status).toBe(200);
    const data = res.body.data as Edited;
    expect(Object.keys(data).sort()).toEqual(['import', 'row']);
    expect(Object.keys(data.row).sort()).toEqual(['problems', 'raw', 'reasons', 'rowNumber', 'status', 'warnings']);
    expect(data.row).toMatchObject({ rowNumber: 3, status: 'valid', reasons: [], problems: {} });
    expect(data.row.raw).toMatchObject({ Phone: '01912345678', Qty: '2', Product: 'Kurti' });
    expect(data.import.status).toBe('validated');
    expect(data.import.counts).toEqual({ total: 3, valid: 2, duplicate: 0, invalid: 1, orders: 2 });
  });

  it('a value that is still wrong stays invalid with the new error', async () => {
    const id = await checked();
    const data = (await edit(id, 3, { Phone: '01912345678' })).body.data as Edited;
    expect(data.row.status).toBe('invalid');
    expect(data.row.problems).toEqual({ quantity: 'Enter a whole number of 1 or more' });
  });

  it('a fix that makes a copy of another row is reported as a duplicate', async () => {
    const id = await checked(
      seller,
      [HEADERS, ',2026-10-05,01712345678,Saree,1,1000,', ',2026-10-05,01712345678,Saree,x,1000,'].join('\n'),
    );
    const data = (await edit(id, 3, { Qty: '1' })).body.data as Edited;
    expect(data.row.status).toBe('duplicate');
    expect(data.import.counts).toMatchObject({ valid: 1, duplicate: 1, invalid: 0 });
  });

  it('a row whose order ID was already imported can get a new ID and be imported', async () => {
    const owner = await registerSeller(app, 'dup@rows.test', 'Dup Shop');
    const file = [HEADERS, 'D-1,2026-10-05,01712345678,Saree,1,1000,'].join('\n');
    const first = await checked(owner, file);
    expect((await owner.send('post', `/imports/${first}/commit`)).status).toBe(200);

    const again = await checked(owner, file);
    const [row] = (await owner.get(`/imports/${again}/rows?status=duplicate`)).body.data as ImportRowDto[];
    expect(row.problems).toEqual({ externalRef: 'This order ID is already imported. Enter a new one if this is a different order.' });

    const same = (await edit(again, 2, { 'Order ID': 'D-1' }, owner)).body.data as Edited;
    expect(same.row.status).toBe('duplicate');
    const fixed = (await edit(again, 2, { 'Order ID': 'D-2' }, owner)).body.data as Edited;
    expect(fixed.row).toMatchObject({ status: 'valid', problems: {} });
    expect(fixed.import.counts).toMatchObject({ valid: 1, duplicate: 0, orders: 1 });
    expect((await owner.send('post', `/imports/${again}/commit`)).body.data.ordersCreated).toBe(1);
    expect(await prisma.order.count({ where: { externalRef: { in: ['D-1', 'D-2'] } } })).toBe(2);
  });

  it('imports the corrected values', async () => {
    const id = await checked();
    await edit(id, 3, { Phone: '01912345678', Qty: '2' });
    await edit(id, 4, { Discount: '50' });
    expect((await seller.send('post', `/imports/${id}/commit`)).body.data.ordersCreated).toBe(3);
    const order = await prisma.order.findFirstOrThrow({
      where: { importId: id, externalRef: 'A-2' },
      include: { items: true, customer: true },
    });
    expect(order.customer.phone).toBe('01912345678');
    expect(order.items[0].quantity).toBe(2);
  });

  it('422 for a column the file does not have, and for an empty or oversized edit', async () => {
    const id = await checked();
    const unknown = await edit(id, 3, { Nope: 'x' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.fields['cells.Nope']).toBeDefined();
    expect(await rawOf(id, 3)).not.toHaveProperty('Nope');
    expect((await edit(id, 3, {})).status).toBe(422);
    expect((await edit(id, 3, { Phone: 'x'.repeat(501) })).status).toBe(422);
  });

  it('404 for a row that does not exist', async () => {
    const id = await checked();
    const res = await edit(id, 99, { Phone: '01912345678' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('import_row_not_found');
  });

  it('409 before the file is checked and after it is imported', async () => {
    const up = await seller.upload('/imports', 'file', Buffer.from(FILE), 'orders.csv');
    expect((await edit(up.body.data.id as string, 3, { Phone: '01912345678' })).status).toBe(409);
    // Its own seller: the order IDs of this file were imported by an earlier test.
    const fresh = await registerSeller(app, 'done@rows.test', 'Done Shop');
    const id = await checked(fresh);
    expect((await fresh.send('post', `/imports/${id}/commit`)).status).toBe(200);
    const res = await edit(id, 3, { Phone: '01912345678' }, fresh);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('import_not_ready');
  });

  it('rolls the edit back when the re-check fails', async () => {
    const id = await checked();
    const spy = jest.spyOn(ImportsRepository.prototype, 'writeValidation').mockRejectedValueOnce(new Error('boom'));
    expect((await edit(id, 3, { Phone: '01912345678' })).status).toBe(500);
    spy.mockRestore();
    expect((await rawOf(id, 3)).Phone).toBe('12345');
  });
});
