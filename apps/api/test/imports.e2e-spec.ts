import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProfitSummaryDto } from '@ph/shared';
import * as XLSX from 'xlsx';
import type { PrismaService } from '../src/common/prisma.service';
import { headersKey } from '../src/modules/imports/headers-key';
import { ImportMappingsRepository } from '../src/modules/imports/import-mappings.repository';
import { ImportsRepository } from '../src/modules/imports/imports.repository';
import { CustomersService } from '../src/modules/customers/customers.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { ProductsService } from '../src/modules/products/products.service';
import { dedupeHash, parseRow } from '../src/modules/imports/rules/row-parse';
import { PARSE_LIMITS } from '../src/modules/imports/spreadsheet';
import { TEMPLATE_HEADERS } from '../src/modules/imports/template';
import { makeSampleOrders, SAMPLE_HEADERS, SAMPLE_MAPPING, SAMPLE_TOTALS, SEED_ORDER_REFS } from './fixtures/make-sample-orders';
import { makeWideRowXlsx } from './fixtures/make-wide-row-xlsx';
import { Client, createTestApp, registerSeller } from './helpers';

describe('Imports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let imports: ImportsRepository;
  let mappings: ImportMappingsRepository;
  let bizA: string;
  let bizB: string;
  let sellerA: Client;
  let sellerB: Client;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    imports = new ImportsRepository(prisma);
    mappings = new ImportMappingsRepository(prisma);
    sellerA = await registerSeller(app, 'a@imports.test', 'Shop A');
    sellerB = await registerSeller(app, 'b@imports.test', 'Shop B');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM businesses ORDER BY "createdAt"`;
    [bizA, bizB] = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = ['Phone', 'Product', 'Qty'];
  const newImport = (businessId: string, rows: Array<{ rowNumber: number; raw: Record<string, string> }>) =>
    imports.transaction((tx) =>
      imports.create(businessId, { fileName: 'orders.csv', headers, headersKey: headersKey(headers), createdById: null }, rows, tx),
    );

  async function businessOf(seller: Client): Promise<string> {
    return (await seller.get('/auth/me')).body.data.business.id as string;
  }

  /** An existing imported order, written straight to the table. */
  async function seedOrder(businessId: string, orderNo: number, data: { externalRef?: string; dedupeHash?: string }) {
    const customer = await prisma.customer.upsert({
      where: { businessId_phone: { businessId, phone: '01799999999' } },
      update: {},
      create: { businessId, name: 'Seeded', phone: '01799999999' },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo,
        customerId: customer.id,
        status: 'delivered',
        orderDate: new Date('2026-09-01'),
        subtotal: 100000,
        total: 100000,
        source: 'import',
        ...data,
      },
    });
  }

  async function uploadMapped(seller: Client, file: Buffer, columns: Record<string, string>, statuses = {}) {
    const up = await seller.upload('/imports', 'file', file, 'orders.xlsx');
    expect(up.status).toBe(201);
    const id = up.body.data.id as string;
    const put = await seller.send('put', `/imports/${id}/mapping`, { columns, statuses });
    expect(put.status).toBe(200);
    return id;
  }

  const sheet = (header: string[], aoa: (string | number)[][]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...aoa]), 'Orders');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  };
  const commit = (seller: Client, id: string) => seller.send('post', `/imports/${id}/commit`);

  async function validated(seller: Client, file: Buffer, columns: Record<string, string>, statuses = {}) {
    const id = await uploadMapped(seller, file, columns, statuses);
    const res = await seller.send('post', `/imports/${id}/validate`);
    expect(res.status).toBe(200);
    return id;
  }

  describe('database', () => {
    it('refuses an unknown import status', async () => {
      const id = await newImport(bizA, []);
      await expect(prisma.$executeRaw`UPDATE imports SET status = 'done' WHERE id = ${id}::uuid`).rejects.toThrow(/imports_status_check/);
    });

    it('refuses an unknown row status', async () => {
      const id = await newImport(bizA, [{ rowNumber: 2, raw: { Phone: '01712345678' } }]);
      await expect(prisma.$executeRaw`UPDATE import_rows SET status = 'maybe' WHERE "importId" = ${id}::uuid`).rejects.toThrow(
        /import_rows_status_check/,
      );
    });

    it('keeps one saved mapping per business and header set', async () => {
      const key = headersKey(headers);
      await mappings.save(bizA, key, { phone: 'Phone' });
      await mappings.save(bizA, key, { phone: 'Mobile' });
      await mappings.save(bizB, key, { phone: 'Other' });
      const count = await prisma.$queryRaw<
        Array<{ n: number }>
      >`SELECT count(*)::int AS n FROM import_mappings WHERE "businessId" = ${bizA}::uuid`;
      expect(count[0].n).toBe(1);
      expect(await mappings.find(bizA, key)).toEqual({ phone: 'Mobile' });
      expect(await mappings.find(bizB, key)).toEqual({ phone: 'Other' });
      expect(await mappings.find(bizA, 'nope')).toBeNull();
    });
  });

  describe('repository', () => {
    it('writes validation for many rows in one statement and links orders by group key', async () => {
      const rows = Array.from({ length: 2500 }, (_, i) => ({
        rowNumber: i + 2,
        raw: { Phone: `0171${i}`, Status: i % 2 ? 'Delivered' : 'Pending' },
      }));
      const id = await newImport(bizA, rows);
      expect(await imports.find(bizB, id)).toBeNull(); // foreign id is not found
      const all = await imports.allRows(bizA, id);
      expect(all).toHaveLength(2500);
      expect(all[0].rowNumber).toBe(2);

      const counts = await imports.statusValueCounts(bizA, id, 'Status');
      expect(counts).toEqual(
        expect.arrayContaining([
          { value: 'Delivered', count: 1250 },
          { value: 'Pending', count: 1250 },
        ]),
      );

      await imports.transaction(async (tx) => {
        expect(await imports.lockForUpdate(bizB, id, tx)).toBeNull();
        expect(await imports.lockForUpdate(bizA, id, tx)).toEqual({ status: 'uploaded' });
        await imports.writeValidation(
          id,
          [
            { rowNumber: 2, status: 'valid', normalized: { a: 1 }, errors: null, groupKey: 'g1' },
            { rowNumber: 3, status: 'invalid', normalized: null, errors: ['bad'], groupKey: null },
          ],
          tx,
        );
        await imports.setStatus(id, 'validated', { totalRows: 2500, validRows: 1, invalidRows: 1, duplicateRows: 0 }, tx);
        const customer = await tx.customer.create({ data: { businessId: bizA, name: 'C', phone: '01712345678' } });
        const order = await tx.order.create({
          data: {
            businessId: bizA,
            orderNo: 1,
            customerId: customer.id,
            orderDate: new Date('2026-01-01'),
            subtotal: 0,
            total: 0,
            importId: id,
          },
        });
        // a group key no row carries links nothing and is not an error
        await imports.linkOrders(
          id,
          [
            { groupKey: 'g1', orderId: order.id },
            { groupKey: 'zz', orderId: order.id },
          ],
          tx,
        );
      });
      const valid = await imports.rows(bizA, id, { status: 'valid', page: 1, perPage: 10 });
      expect(valid.total).toBe(1);
      expect(valid.rows[0].rowNumber).toBe(2);
      expect(valid.rows[0].orderId).toEqual(expect.any(String));
      expect(valid.rows[0].groupKey).toBe('g1');
      const invalid = await imports.rows(bizA, id, { status: 'invalid', page: 1, perPage: 10 });
      expect(invalid.rows.map((r) => r.orderId)).toEqual([null]);
      const meta = await imports.find(bizA, id);
      expect(meta?.status).toBe('validated');
      expect(meta?.validRows).toBe(1);
      const list = await imports.paginate(bizA, { page: 1, perPage: 10 });
      expect(list.rows.every((r) => r.id)).toBe(true);
      expect((await imports.paginate(bizB, { page: 1, perPage: 10 })).total).toBe(0);
    });
  });

  describe('upload and mapping', () => {
    const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const DTO_KEYS = [
      'counts',
      'createdAt',
      'fileName',
      'headers',
      'id',
      'importedOrders',
      'mapping',
      'missingCostProducts',
      'sampleRows',
      'status',
      'statusValues',
      'suggestedColumns',
    ];
    const HEADERS = ['Order ID', 'Date', 'Customer', 'Mobile', 'Address', 'Item', 'Qty', 'Price', 'Status'];
    const row = (n: number, status = 'Delivered') => [
      `R${n}`,
      '02/11/2026',
      `Customer ${n}`,
      '01712345678',
      'Dhanmondi, Dhaka',
      'Cotton Panjabi',
      '1',
      '1250',
      status,
    ];

    function xlsx(aoa: (string | number)[][]): Buffer {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Orders');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    const mapping = (columns: Record<string, string>, statuses: Record<string, string> = {}) => ({ columns, statuses });
    const BASIC = { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' };

    it('401 without a session', async () => {
      const res = await new Client(app).upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      expect(res.status).toBe(401);
    });

    it('uploads an xlsx and suggests columns', async () => {
      const file = xlsx([HEADERS, row(1), row(2), row(3), row(4), row(5), row(6), row(7)]);
      const res = await sellerA.upload('/imports', 'file', file, 'orders.xlsx');
      expect(res.status).toBe(201);
      const dto = res.body.data;
      expect(Object.keys(dto).sort()).toEqual(DTO_KEYS);
      expect(dto).not.toHaveProperty('businessId');
      expect(dto).not.toHaveProperty('rows');
      expect(dto).toMatchObject({
        fileName: 'orders.xlsx',
        status: 'uploaded',
        headers: HEADERS,
        mapping: null,
        counts: { total: 7, valid: 0, duplicate: 0, invalid: 0, orders: 0 },
        importedOrders: 0,
        missingCostProducts: 0,
      });
      expect(dto.suggestedColumns.phone).toBe('Mobile');
      expect(dto.suggestedColumns.product).toBe('Item');
      expect(dto.sampleRows).toHaveLength(5);
      expect(dto.sampleRows[0]).toEqual(Object.fromEntries(HEADERS.map((h, i) => [h, row(1)[i]])));
      // Status values come from the suggested status column while nothing is mapped.
      expect(dto.statusValues).toEqual([{ value: 'Delivered', count: 7, suggested: 'delivered' }]);
      expect(await prisma.importRow.count({ where: { importId: dto.id } })).toBe(7);

      const shown = await sellerA.get(`/imports/${dto.id}`);
      expect(shown.status).toBe(200);
      expect(shown.body.data).toEqual(dto);
    });

    it('keeps a Bangla file name', async () => {
      const res = await sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'অক্টোবর অর্ডার.xlsx');
      expect(res.body.data.fileName).toBe('অক্টোবর অর্ডার.xlsx');
    });

    it('422 with a field error when no file is sent', async () => {
      const res = await sellerA.send('post', '/imports', {});
      expect(res.status).toBe(422);
      expect(res.body.error.fields.file).toBeDefined();
    });

    it('413 for a 6 MB file', async () => {
      const before = await prisma.import.count();
      const res = await sellerA.upload('/imports', 'file', Buffer.alloc(6 * 1024 * 1024, 'a'), 'orders.csv');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('import_file_too_large');
      expect(await prisma.import.count()).toBe(before);
    });

    it('415 for a text file with NUL bytes named orders.csv', async () => {
      const res = await sellerA.upload('/imports', 'file', Buffer.from('Mobile,Item\n\0\0\0'), 'orders.csv');
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('import_file_unsupported');
    });

    it('400 for an upload with more than 5 other fields or 10 parts, creating nothing', async () => {
      const before = await prisma.import.count();
      let sixFields = sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      for (let i = 0; i < 6; i++) sixFields = sixFields.field(`f${i}`, 'x');
      expect((await sixFields).status).toBe(400);
      let elevenParts = sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      for (let i = 0; i < 10; i++) elevenParts = elevenParts.attach(`extra${i}`, Buffer.from('a'), 'a.csv');
      expect((await elevenParts).status).toBe(400);
      expect(await prisma.import.count()).toBe(before);
      const ok = sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx').field('note', 'x');
      expect((await ok).status).toBe(201);
    });

    it('415 for a wide-row zip bomb, while other requests keep being served', async () => {
      const before = await prisma.import.count();
      const bomb = makeWideRowXlsx(300); // ~150 KB, ~5 million cells
      const started = Date.now();
      const upload = sellerA.upload('/imports', 'file', bomb, 'orders.xlsx').then((res) => ({ res, ms: Date.now() - started }));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const asked = Date.now();
      const list = await sellerB.get('/imports');
      expect(list.status).toBe(200);
      expect(Date.now() - asked).toBeLessThan(1000);

      const { res, ms } = await upload;
      expect(res.status).toBe(415);
      expect(res.body.error.code).toBe('import_file_unsupported');
      expect(ms).toBeLessThan(PARSE_LIMITS.timeoutMs + 2000);
      expect(await prisma.import.count()).toBe(before);
    }, 30_000);

    it('another business gets 404 for GET /imports/:id and PUT mapping, and sees none in its list', async () => {
      const owner = await registerSeller(app, 'owner@imports.test', 'Owner Shop');
      const intruder = await registerSeller(app, 'intruder@imports.test', 'Intruder Shop');
      const up = await owner.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      const id = up.body.data.id;
      expect((await intruder.get(`/imports/${id}`)).status).toBe(404);
      const put = await intruder.send('put', `/imports/${id}/mapping`, mapping(BASIC));
      expect(put.status).toBe(404);
      expect(put.body.error.code).toBe('import_not_found');
      expect((await intruder.get('/imports')).body.meta.total).toBe(0);
      expect((await prisma.import.findUnique({ where: { id } }))?.status).toBe('uploaded');
      expect((await owner.get('/imports/not-a-uuid')).status).toBe(400);
    });

    it('422 when the mapping misses quantity', async () => {
      const up = await sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      const { quantity: _q, ...noQty } = BASIC;
      const res = await sellerA.send('put', `/imports/${up.body.data.id}/mapping`, mapping(noQty));
      expect(res.status).toBe(422);
      expect(res.body.error.fields['columns.quantity']).toEqual(['Choose the column for Quantity.']);
    });

    it('422 when a mapped column is not in the file', async () => {
      const up = await sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      const res = await sellerA.send('put', `/imports/${up.body.data.id}/mapping`, mapping({ ...BASIC, phone: 'Phone' }));
      expect(res.status).toBe(422);
      expect(Object.keys(res.body.error.fields)).toEqual(['columns.phone']);
      expect((await imports.find(bizA, up.body.data.id))?.mapping).toBeNull();
    });

    it('reuses the saved mapping when the same headers are uploaded again', async () => {
      const headers = [...HEADERS, 'Notes'];
      const file = xlsx([headers, [...row(1), 'gift']]);
      const first = await sellerA.upload('/imports', 'file', file, 'october.xlsx');
      expect(first.body.data.status).toBe('uploaded');
      const saved = mapping(BASIC, { Delivered: 'delivered' });
      const put = await sellerA.send('put', `/imports/${first.body.data.id}/mapping`, saved);
      expect(put.status).toBe(200);
      expect(put.body.data).toMatchObject({ status: 'mapped', mapping: saved });

      const second = await sellerA.upload('/imports', 'file', file, 'november.xlsx');
      expect(second.status).toBe(201);
      expect(second.body.data.status).toBe('mapped');
      expect(second.body.data.mapping).toEqual(saved);

      // Another business with the same layout gets nothing of A's.
      const other = await sellerB.upload('/imports', 'file', file, 'orders.xlsx');
      expect(other.body.data).toMatchObject({ status: 'uploaded', mapping: null });
    });

    it('does not reuse a saved mapping whose columns are missing from the new file', async () => {
      const headers = ['Phone No', 'Product', 'Pieces', 'Rate'];
      const first = await sellerA.upload('/imports', 'file', xlsx([headers, ['01712345678', 'Saree', '1', '900']]), 'a.xlsx');
      const cols = { phone: 'Phone No', product: 'Product', quantity: 'Pieces', sellingPrice: 'Rate' };
      expect((await sellerA.send('put', `/imports/${first.body.data.id}/mapping`, mapping(cols))).status).toBe(200);
      // Same header set by headersKey (case-insensitive), but the exact column names differ.
      const lower = headers.map((h) => h.toLowerCase());
      const second = await sellerA.upload('/imports', 'file', xlsx([lower, ['01712345678', 'Saree', '1', '900']]), 'b.xlsx');
      expect(second.body.data).toMatchObject({ status: 'uploaded', mapping: null });
    });

    it('lists status values with counts and suggestions', async () => {
      const file = xlsx([HEADERS, row(1), row(2), row(3, 'RTO'), row(4)]);
      const up = await sellerA.upload('/imports', 'file', file, 'orders.xlsx');
      expect(up.body.data.statusValues).toEqual([
        { value: 'Delivered', count: 3, suggested: 'delivered' },
        { value: 'RTO', count: 1, suggested: 'returned' },
      ]);
      // Once mapped without a status column, there are no status values to map.
      const { status: _s, ...noStatus } = BASIC;
      const put = await sellerA.send('put', `/imports/${up.body.data.id}/mapping`, mapping(noStatus));
      expect(put.body.data.statusValues).toEqual([]);
    });

    it('saving a mapping on a validated import clears the validation', async () => {
      const up = await sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1), row(2)]), 'orders.xlsx');
      const id = up.body.data.id;
      await imports.transaction(async (tx) => {
        await imports.writeValidation(
          id,
          [
            { rowNumber: 2, status: 'valid', normalized: { a: 1 }, errors: null, groupKey: 'ref:R1' },
            { rowNumber: 3, status: 'invalid', normalized: null, errors: ['phone_invalid'], groupKey: null },
          ],
          tx,
        );
        await imports.setStatus(id, 'validated', { validRows: 1, invalidRows: 1 }, tx);
      });
      expect((await sellerA.get(`/imports/${id}`)).body.data.counts).toEqual({ total: 2, valid: 1, duplicate: 0, invalid: 1, orders: 1 });

      const put = await sellerA.send('put', `/imports/${id}/mapping`, mapping(BASIC));
      expect(put.status).toBe(200);
      expect(put.body.data).toMatchObject({ status: 'mapped', counts: { total: 2, valid: 0, duplicate: 0, invalid: 0, orders: 0 } });
      const rows = await prisma.importRow.findMany({ where: { importId: id }, select: { status: true, normalized: true, groupKey: true } });
      expect(rows).toEqual([
        { status: 'pending', normalized: null, groupKey: null },
        { status: 'pending', normalized: null, groupKey: null },
      ]);
      // Saving the same mapping twice is safe.
      expect((await sellerA.send('put', `/imports/${id}/mapping`, mapping(BASIC))).status).toBe(200);
    });

    it('409 when the import is past mapping', async () => {
      const up = await sellerA.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      await prisma.import.update({ where: { id: up.body.data.id }, data: { status: 'imported' } });
      const res = await sellerA.send('put', `/imports/${up.body.data.id}/mapping`, mapping(BASIC));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('import_not_ready');
    });

    it('lists imports newest first with canUndo, scoped to the business', async () => {
      const seller = await registerSeller(app, 'list@imports.test', 'List Shop');
      const other = await registerSeller(app, 'list-other@imports.test', 'Other Shop');
      await other.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'not-mine.xlsx');
      await seller.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'b-first.xlsx');
      const up = await seller.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'b-latest.xlsx');
      await prisma.import.update({ where: { id: up.body.data.id }, data: { status: 'imported', importedRows: 1 } });
      const res = await seller.get('/imports?perPage=1');
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, perPage: 1, total: 2 });
      expect(res.body.data).toEqual([
        {
          id: up.body.data.id,
          fileName: 'b-latest.xlsx',
          status: 'imported',
          createdAt: expect.any(String),
          importedOrders: 1,
          canUndo: true,
        },
      ]);
      const page2 = await seller.get('/imports?page=2&perPage=1');
      expect(page2.body.data).toEqual([expect.objectContaining({ fileName: 'b-first.xlsx', status: 'uploaded', canUndo: false })]);
    });

    it('402 after the trial ends', async () => {
      const seller = await registerSeller(app, 'ended@imports.test', 'Ended Shop');
      const me = await seller.get('/auth/me');
      await prisma.business.update({ where: { id: me.body.data.business.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      const res = await seller.upload('/imports', 'file', xlsx([HEADERS, row(1)]), 'orders.xlsx');
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('trial_ended');
      expect(await prisma.import.count({ where: { businessId: me.body.data.business.id } })).toBe(0);
      expect((await seller.get('/imports')).status).toBe(200);
    });

    it('GET /imports/template.xlsx returns an xlsx attachment', async () => {
      const res = await sellerA.get('/imports/template.xlsx').responseType('blob');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(XLSX_TYPE);
      expect(res.headers['content-disposition']).toBe('attachment; filename="profithishab-orders-template.xlsx"');
      const wb = XLSX.read(res.body as Buffer, { type: 'buffer' });
      const [header] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      expect(header).toEqual([...TEMPLATE_HEADERS]);
      expect((await new Client(app).get('/imports/template.xlsx')).status).toBe(401);
    });
  });

  describe('validate, preview and rejected rows', () => {
    const ROW_KEYS = ['raw', 'reasons', 'rowNumber', 'status', 'warnings'];
    const MAPPING = { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price', externalRef: 'Order ID' };
    const small = (aoa: (string | number)[][]) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Order ID', 'Mobile', 'Item', 'Qty', 'Price'], ...aoa]), 'Orders');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    };

    let sample: { seller: Client; id: string };
    beforeAll(async () => {
      const seller = await registerSeller(app, 'sample@imports.test', 'Sample Shop');
      const biz = await businessOf(seller);
      for (const [k, ref] of SEED_ORDER_REFS.entries()) await seedOrder(biz, 900001 + k, { externalRef: ref });
      sample = { seller, id: await uploadMapped(seller, makeSampleOrders(), SAMPLE_MAPPING.columns, SAMPLE_MAPPING.statuses) };
    });

    it('counts 237 rows as 225 valid, 8 duplicate, 4 invalid', async () => {
      const res = await sample.seller.send('post', `/imports/${sample.id}/validate`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('validated');
      expect(res.body.data.counts).toEqual({ total: 237, valid: 225, duplicate: 8, invalid: 4, orders: 225 });

      const rows = await prisma.importRow.findMany({
        where: { importId: sample.id },
        select: { rowNumber: true, status: true, normalized: true, errors: true, groupKey: true },
        orderBy: { rowNumber: 'asc' },
      });
      const valid = rows.filter((r) => r.status === 'valid');
      const values = valid.map((r) => r.normalized as { quantity: number; unitPrice: number; unitCost: number; courierCost: number });
      expect(values.reduce((a, v) => a + v.quantity * v.unitPrice, 0)).toBe(SAMPLE_TOTALS.sales);
      expect(values.reduce((a, v) => a + v.quantity * v.unitCost, 0)).toBe(SAMPLE_TOTALS.productCost);
      expect(values.reduce((a, v) => a + v.courierCost, 0)).toBe(SAMPLE_TOTALS.courierCost);
      expect(valid.every((r) => r.groupKey !== null)).toBe(true);

      const reasonsOf = (status: string) =>
        rows.filter((r) => r.status === status).map((r) => [r.rowNumber, (r.errors as { reasons: string[] }).reasons]);
      expect(reasonsOf('duplicate')).toEqual([
        ...[227, 228, 229, 230, 231].map((n) => [n, ['duplicate_in_file']]),
        ...[232, 233, 234].map((n) => [n, ['duplicate_ref']]),
      ]);
      const duplicates = rows.filter((r) => r.status === 'duplicate');
      expect(duplicates.every((r) => r.groupKey !== null && r.normalized === null)).toBe(true);
      expect(rows.filter((r) => r.status === 'invalid').every((r) => r.groupKey === null && r.normalized === null)).toBe(true);
    });

    it('GET rows?status=invalid shows each reason', async () => {
      const res = await sample.seller.get(`/imports/${sample.id}/rows?status=invalid`);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, perPage: 25, total: 4 });
      expect(Object.keys(res.body.data[0]).sort()).toEqual(ROW_KEYS);
      expect(
        res.body.data.map((r: { rowNumber: number; status: string; reasons: string[] }) => [r.rowNumber, r.status, r.reasons]),
      ).toEqual([
        [235, 'invalid', ['phone_invalid']],
        [236, 'invalid', ['product_missing']],
        [237, 'invalid', ['quantity_invalid']],
        [238, 'invalid', ['date_invalid']],
      ]);
      expect(res.body.data[0].raw).toMatchObject({ Phone: '01234', Product: 'Kurti' });
      expect(res.body.data[0]).not.toHaveProperty('normalized');
      expect(res.body.data[0]).not.toHaveProperty('businessId');

      const page = await sample.seller.get(`/imports/${sample.id}/rows?page=2&perPage=100`);
      expect(page.body.meta).toEqual({ page: 2, perPage: 100, total: 237 });
      expect(page.body.data[0]).toMatchObject({ rowNumber: 102, status: 'valid', reasons: [], warnings: [] });
      expect((await sample.seller.get(`/imports/${sample.id}/rows?status=maybe`)).status).toBe(422);
    });

    it('rejected.csv starts with a BOM and has 12 data rows', async () => {
      const res = await sample.seller
        .get(`/imports/${sample.id}/rejected.csv`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks).toString('utf8')));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe('attachment; filename="rejected-rows.csv"');
      const text = res.body as string;
      expect(text.startsWith('\uFEFF')).toBe(true);
      const lines = text.slice(1).split('\r\n');
      expect(lines.at(-1)).toBe('');
      expect(lines[0]).toBe([...SAMPLE_HEADERS, 'Row', 'Status', 'Reason'].join(','));
      const data = lines.slice(1, -1);
      expect(data).toHaveLength(12);
      expect(data[0]).toMatch(/,227,Duplicate,Same as an earlier row in this file$/);
      expect(data[5]).toMatch(/^FB-90001,.*,232,Duplicate,An order with this order ID already exists$/);
      expect(data[8]).toMatch(/^,15\/10\/2026,Extra Customer 11,01234,.*,235,Invalid,Phone number is not valid$/);
      expect(data[11]).toMatch(/,238,Invalid,Order date is not a valid date$/);
    });

    it('re-validating after a mapping change gives fresh counts', async () => {
      // Without the Order ID column the three seeded IDs no longer match: those rows become valid.
      const { externalRef: _ref, ...noRef } = SAMPLE_MAPPING.columns;
      expect((await sample.seller.send('put', `/imports/${sample.id}/mapping`, { columns: noRef, statuses: {} })).status).toBe(200);
      const once = await sample.seller.send('post', `/imports/${sample.id}/validate`);
      expect(once.body.data.counts).toEqual({ total: 237, valid: 228, duplicate: 5, invalid: 4, orders: 228 });
      // Validating again without a change is safe and gives the same verdicts.
      const twice = await sample.seller.send('post', `/imports/${sample.id}/validate`);
      expect(twice.body.data.counts).toEqual(once.body.data.counts);
      const statuses = await prisma.importRow.groupBy({ by: ['status'], where: { importId: sample.id }, _count: true });
      expect(Object.fromEntries(statuses.map((s) => [s.status, s._count]))).toEqual({ valid: 228, duplicate: 5, invalid: 4 });
      // And back to the original mapping.
      await sample.seller.send('put', `/imports/${sample.id}/mapping`, SAMPLE_MAPPING);
      const back = await sample.seller.send('post', `/imports/${sample.id}/validate`);
      expect(back.body.data.counts).toEqual({ total: 237, valid: 225, duplicate: 8, invalid: 4, orders: 225 });
    });

    it('groups two rows with the same order ID into one order with two items', async () => {
      const seller = await registerSeller(app, 'group@imports.test', 'Group Shop');
      const file = small([
        ['FB-1', '01712345678', 'Jamdani Saree', 1, 4500],
        ['FB-1', '01712345678', 'Hijab', 2, 450],
        ['FB-2', '01812345678', 'Panjabi', 1, 1850],
      ]);
      const id = await uploadMapped(seller, file, MAPPING);
      const res = await seller.send('post', `/imports/${id}/validate`);
      expect(res.body.data.counts).toEqual({ total: 3, valid: 3, duplicate: 0, invalid: 0, orders: 2 });
      const rows = await prisma.importRow.findMany({ where: { importId: id }, select: { groupKey: true }, orderBy: { rowNumber: 'asc' } });
      expect(rows.map((r) => r.groupKey)).toEqual(['ref:FB-1', 'ref:FB-1', 'ref:FB-2']);
    });

    it('marks every row of an order invalid when one of its rows is invalid or the rows disagree', async () => {
      const seller = await registerSeller(app, 'conflict@imports.test', 'Conflict Shop');
      const file = small([
        ['FB-1', '01712345678', 'Saree', 1, 4500], // fine alone, but its order has a bad row
        ['FB-1', '01712345678', 'Hijab', 0, 450],
        ['FB-2', '01712345678', 'Panjabi', 1, 1850], // same order ID, different phones
        ['FB-2', '01812345678', 'Kurti', 1, 1250],
        ['FB-3', '01912345678', 'Lungi', 1, 650],
      ]);
      const id = await uploadMapped(seller, file, MAPPING);
      const res = await seller.send('post', `/imports/${id}/validate`);
      expect(res.body.data.counts).toEqual({ total: 5, valid: 1, duplicate: 0, invalid: 4, orders: 1 });
      const list = await seller.get(`/imports/${id}/rows`);
      expect(list.body.data.map((r: { status: string; reasons: string[] }) => [r.status, r.reasons])).toEqual([
        ['invalid', ['order_row_invalid']],
        ['invalid', ['quantity_invalid']],
        ['invalid', ['order_conflict']],
        ['invalid', ['order_conflict']],
        ['valid', []],
      ]);
    });

    it('marks a row without an order ID duplicate_row when an existing order has its fingerprint', async () => {
      const seller = await registerSeller(app, 'hash@imports.test', 'Hash Shop');
      const biz = await businessOf(seller);
      // An explicit date keeps the fingerprint independent of the clock (no "today" fallback).
      const wb = XLSX.utils.book_new();
      const aoa = [
        ['Date', 'Mobile', 'Item', 'Qty', 'Price'],
        ['05/10/2026', '01712345678', 'Saree', 1, 4500],
        ['05/10/2026', '01712345678', 'Saree', 1, 4500],
        ['05/10/2026', '01812345678', 'Saree', 1, 4500],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Orders');
      const columns = { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price', orderDate: 'Date' };
      const id = await uploadMapped(seller, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, columns);
      const raw = { Date: '05/10/2026', Mobile: '01712345678', Item: 'Saree', Qty: '1', Price: '4500' };
      const parsed = parseRow(raw, { columns, statuses: {} }, { today: '2000-01-01', couriers: new Map() });
      if (!parsed.ok) throw new Error('row should parse');
      expect(parsed.value.orderDate).toBe('2026-10-05');
      await seedOrder(biz, 900001, { dedupeHash: dedupeHash(parsed.value) });
      // Another business with the same fingerprint must not count.
      await seedOrder(bizB, 900101, { dedupeHash: dedupeHash({ ...parsed.value, phone: '01812345678' }) });

      const res = await seller.send('post', `/imports/${id}/validate`);
      expect(res.body.data.counts).toEqual({ total: 3, valid: 1, duplicate: 2, invalid: 0, orders: 1 });
      const list = await seller.get(`/imports/${id}/rows`);
      expect(
        list.body.data.map((r: { status: string; reasons: string[]; warnings: string[] }) => [r.status, r.reasons, r.warnings]),
      ).toEqual([
        ['duplicate', ['duplicate_row'], []],
        ['duplicate', ['duplicate_row'], []],
        ['valid', [], ['cost_missing']],
      ]);
    });

    it("ignores another business's couriers and order IDs", async () => {
      const seller = await registerSeller(app, 'isolated@imports.test', 'Isolated Shop');
      const other = await registerSeller(app, 'isolated-b@imports.test', 'Other Isolated Shop');
      const otherBiz = await businessOf(other);
      await prisma.courier.create({ data: { businessId: otherBiz, name: 'RedX Only-B' } });
      await seedOrder(otherBiz, 900201, { externalRef: 'ISO-1' });

      const wb = XLSX.utils.book_new();
      const aoa = [
        ['Order ID', 'Mobile', 'Item', 'Qty', 'Price', 'Courier'],
        ['ISO-1', '01712345678', 'Saree', 1, 4500, 'RedX Only-B'],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Orders');
      const id = await uploadMapped(seller, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, {
        ...MAPPING,
        courier: 'Courier',
      });
      const res = await seller.send('post', `/imports/${id}/validate`);
      expect(res.body.data.counts).toEqual({ total: 1, valid: 1, duplicate: 0, invalid: 0, orders: 1 });
      const [row] = await prisma.importRow.findMany({ where: { importId: id }, select: { status: true, normalized: true, errors: true } });
      expect(row.status).toBe('valid');
      expect(row.errors).toEqual({ reasons: [], warnings: ['date_missing', 'cost_missing'] });
      expect(row.normalized).toMatchObject({ externalRef: 'ISO-1', courierId: null });
    });

    it('matches couriers by name whatever the case', async () => {
      const seller = await registerSeller(app, 'courier@imports.test', 'Courier Shop');
      const biz = await businessOf(seller);
      const wb = XLSX.utils.book_new();
      const aoa = [
        ['Mobile', 'Item', 'Qty', 'Price', 'Courier'],
        ['01712345678', 'Saree', 1, 4500, '  STEADFAST '],
        ['01812345678', 'Saree', 1, 4500, 'Sundarban'],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Orders');
      const id = await uploadMapped(seller, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, {
        phone: 'Mobile',
        product: 'Item',
        quantity: 'Qty',
        sellingPrice: 'Price',
        courier: 'Courier',
      });
      expect((await seller.send('post', `/imports/${id}/validate`)).status).toBe(200);
      const steadfast = await prisma.courier.findFirstOrThrow({ where: { businessId: biz, name: 'Steadfast' } });
      const rows = await prisma.importRow.findMany({
        where: { importId: id },
        select: { normalized: true },
        orderBy: { rowNumber: 'asc' },
      });
      expect(rows.map((r) => (r.normalized as { courierId: string | null }).courierId)).toEqual([steadfast.id, null]);
    });

    it('409 before a mapping and after commit; 401 and 404 for strangers', async () => {
      const seller = await registerSeller(app, 'states@imports.test', 'States Shop');
      const up = await seller.upload('/imports', 'file', small([['', '01712345678', 'Saree', 1, 4500]]), 'orders.xlsx');
      const id = up.body.data.id as string;
      const notReady = await seller.send('post', `/imports/${id}/validate`);
      expect(notReady.status).toBe(409);
      expect(notReady.body.error.code).toBe('import_not_ready');

      await seller.send('put', `/imports/${id}/mapping`, { columns: MAPPING });
      await prisma.import.update({ where: { id }, data: { status: 'imported' } });
      expect((await seller.send('post', `/imports/${id}/validate`)).status).toBe(409);

      const anon = new Client(app);
      expect((await anon.send('post', `/imports/${id}/validate`)).status).toBe(401);
      expect((await anon.get(`/imports/${id}/rows`)).status).toBe(401);
      expect((await anon.get(`/imports/${id}/rejected.csv`)).status).toBe(401);

      for (const res of [
        await sellerB.send('post', `/imports/${sample.id}/validate`),
        await sellerB.get(`/imports/${sample.id}/rows`),
        await sellerB.get(`/imports/${sample.id}/rejected.csv`),
      ]) {
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        expect(res.headers['content-disposition']).toBeUndefined();
        expect(res.body.error.code).toBe('import_not_found');
      }
    });

    it('validates 5,000 rows quickly', async () => {
      const seller = await registerSeller(app, 'big@imports.test', 'Big Shop');
      const aoa = Array.from({ length: 5000 }, (_, i) => [
        i % 2 ? `FB-${i}` : '',
        `01${7 + (i % 2)}${String(30_000_000 + i)}`,
        `Product ${i % 50}`,
        1 + (i % 3),
        500 + (i % 40) * 25,
      ]);
      const id = await uploadMapped(seller, small(aoa), MAPPING);
      const started = Date.now();
      const res = await seller.send('post', `/imports/${id}/validate`);
      const elapsed = Date.now() - started;
      expect(res.body.data.counts).toEqual({ total: 5000, valid: 5000, duplicate: 0, invalid: 0, orders: 5000 });
      expect(elapsed).toBeLessThan(5000);
    }, 30_000);
  });

  describe('commit', () => {
    const RESULT_KEYS = ['customersCreated', 'from', 'missingCostProducts', 'ordersCreated', 'productsCreated', 'to'];
    let fixture: { seller: Client; biz: string; id: string; kurtiId: string };
    beforeAll(async () => {
      const seller = await registerSeller(app, 'commit@imports.test', 'Commit Shop');
      const biz = await businessOf(seller);
      for (const [k, ref] of SEED_ORDER_REFS.entries()) await seedOrder(biz, 900001 + k, { externalRef: ref });
      const kurti = await seller.send('post', '/products', { name: 'Kurti', sellingPrice: 125000, costPrice: 70000, stock: 10 });
      expect(kurti.status).toBe(201);
      const id = await validated(seller, makeSampleOrders(), SAMPLE_MAPPING.columns, SAMPLE_MAPPING.statuses);
      fixture = { seller, biz, id, kurtiId: kurti.body.data.id as string };
    });

    it('401 without a session and 404 for another business, before anything is written', async () => {
      expect((await commit(new Client(app), fixture.id)).status).toBe(401);
      const res = await commit(sellerB, fixture.id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('import_not_found');
      expect(await prisma.order.count({ where: { importId: fixture.id } })).toBe(0);
      expect((await prisma.import.findUniqueOrThrow({ where: { id: fixture.id } })).status).toBe('validated');
    });

    it('imports 225 orders from the fixture', async () => {
      const res = await commit(fixture.seller, fixture.id);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(RESULT_KEYS);
      expect(res.body.data).toEqual({
        ordersCreated: 225,
        customersCreated: 225,
        productsCreated: 8, // Kurti already existed
        missingCostProducts: 0,
        from: SAMPLE_TOTALS.from,
        to: SAMPLE_TOTALS.to,
      });

      const orders = await prisma.order.findMany({
        where: { importId: fixture.id },
        include: { items: true, history: true },
        orderBy: { orderNo: 'asc' },
      });
      expect(orders).toHaveLength(225);
      expect(await prisma.order.count({ where: { businessId: fixture.biz } })).toBe(228); // plus the 3 seeded
      expect(new Set(orders.map((o) => o.orderNo)).size).toBe(225);
      for (const o of orders) {
        expect(o).toMatchObject({ source: 'import', status: 'delivered', returnedAt: null, createdById: expect.any(String) });
        // Delivered on the order date, at the start of that day in Dhaka.
        expect(o.deliveredAt).toEqual(new Date(`${o.orderDate.toISOString().slice(0, 10)}T00:00:00+06:00`));
        expect(o.history).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'delivered', changedById: o.createdById })]);
        expect(o.items).toHaveLength(1);
        expect(o.productCost).toBe(o.items[0].quantity * o.items[0].unitCost);
        expect(o.total).toBe(o.subtotal - o.discount + o.deliveryCharge);
        // Ref-less orders keep their fingerprint so a re-import is caught; ref orders are caught by the ref.
        if (o.externalRef) expect(o.dedupeHash).toBeNull();
        else expect(o.dedupeHash).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(orders.filter((o) => o.externalRef).length).toBe(180);
      const sum = (f: (o: (typeof orders)[number]) => number) => orders.reduce((a, o) => a + f(o), 0);
      expect(sum((o) => o.subtotal)).toBe(SAMPLE_TOTALS.sales);
      expect(sum((o) => o.productCost)).toBe(SAMPLE_TOTALS.productCost);
      expect(sum((o) => o.courierCost)).toBe(SAMPLE_TOTALS.courierCost);
      expect(
        orders
          .find((o) => o.externalRef === 'FB-10001')
          ?.orderDate.toISOString()
          .slice(0, 10),
      ).toBe('2026-10-01');

      // Snapshots on the line; stock is never moved by an import (FR-PROD-07).
      const kurtiLine = orders.flatMap((o) => o.items).find((i) => i.productId === fixture.kurtiId);
      expect(kurtiLine).toMatchObject({ productName: 'Kurti', unitPrice: 125000, unitCost: 70000, lineTotal: 125000 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: fixture.kurtiId } })).stock).toBe(10);
      const created = await prisma.product.findMany({
        where: { importId: fixture.id },
        include: { prices: true },
        orderBy: { sku: 'asc' },
      });
      expect(created).toHaveLength(8);
      const firstUse = new Map<string, Date>();
      for (const o of orders) {
        const seen = firstUse.get(o.items[0].productId);
        if (!seen || o.orderDate < seen) firstUse.set(o.items[0].productId, o.orderDate);
      }
      for (const p of created) {
        expect(p).toMatchObject({ stock: 0, status: 'active', sku: expect.stringMatching(/^PRD-\d{4}$/) });
        expect(p.prices).toEqual([
          expect.objectContaining({ sellingPrice: p.sellingPrice, costPrice: p.costPrice, effectiveFrom: firstUse.get(p.id) }),
        ]);
      }
      expect(new Set(created.map((p) => p.sku)).size).toBe(8);
      expect(await prisma.customer.count({ where: { importId: fixture.id } })).toBe(225);

      // Every valid row points at its order; the import is done.
      const rows = await prisma.importRow.findMany({ where: { importId: fixture.id }, select: { status: true, orderId: true } });
      expect(rows.filter((r) => r.status === 'valid').every((r) => r.orderId)).toBe(true);
      expect(rows.filter((r) => r.status !== 'valid').every((r) => r.orderId === null)).toBe(true);
      const show = await fixture.seller.get(`/imports/${fixture.id}`);
      expect(show.body.data).toMatchObject({ status: 'imported', importedOrders: 225 });

      // The dashboard sees exactly the sheet's money.
      const summary = await fixture.seller.get('/profit/summary?from=2026-10-01&to=2026-10-31');
      expect(summary.status).toBe(200);
      expect(summary.body.data.statement).toMatchObject({
        productSales: SAMPLE_TOTALS.sales,
        productCost: SAMPLE_TOTALS.productCost,
        courierCost: SAMPLE_TOTALS.courierCost,
      });
      expect(summary.body.data.kpis).toMatchObject({ orders: 225, delivered: 225 });
    });

    it('a second commit gets 409 import_not_ready and the order count stays 225', async () => {
      const again = await commit(fixture.seller, fixture.id);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('import_not_ready');
      expect(await prisma.order.count({ where: { importId: fixture.id } })).toBe(225);
    });

    it('re-uploading the same file reports every row as duplicate', async () => {
      const id = await uploadMapped(fixture.seller, makeSampleOrders(), SAMPLE_MAPPING.columns, SAMPLE_MAPPING.statuses);
      const res = await fixture.seller.send('post', `/imports/${id}/validate`);
      expect(res.body.data.counts).toEqual({ total: 237, valid: 0, duplicate: 233, invalid: 4, orders: 0 });
      const reasons = await prisma.importRow.findMany({ where: { importId: id, status: 'duplicate' }, select: { errors: true } });
      const tally = reasons.map((r) => (r.errors as { reasons: string[] }).reasons[0]).sort();
      expect(tally.filter((r) => r === 'duplicate_ref')).toHaveLength(183);
      expect(tally.filter((r) => r === 'duplicate_row')).toHaveLength(50);
    });

    it('two commits at once create the orders once', async () => {
      const seller = await registerSeller(app, 'race@imports.test', 'Race Shop');
      const file = sheet(['Mobile', 'Item', 'Qty', 'Price'], [['01712345678', 'Saree', 1, 4500]]);
      const id = await validated(seller, file, { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' });
      const [a, b] = await Promise.all([commit(seller, id), commit(seller, id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await prisma.order.count({ where: { importId: id } })).toBe(1);
    });

    it('rolls back everything when inserting orders fails', async () => {
      const seller = await registerSeller(app, 'rollback@imports.test', 'Rollback Shop');
      const biz = await businessOf(seller);
      const file = sheet(
        ['Mobile', 'Item', 'Qty', 'Price'],
        [
          ['01712345678', 'Saree', 1, 4500],
          ['01812345678', 'Hijab', 2, 450],
        ],
      );
      const id = await validated(seller, file, { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' });
      const before = await prisma.business.findUniqueOrThrow({ where: { id: biz }, select: { nextOrderNo: true } });

      const spy = jest.spyOn(app.get(OrdersService), 'insertImported').mockRejectedValueOnce(new Error('disk full'));
      const failed = await commit(seller, id);
      spy.mockRestore();
      expect(failed.status).toBe(500);
      expect(await prisma.customer.count({ where: { importId: id } })).toBe(0);
      expect(await prisma.product.count({ where: { importId: id } })).toBe(0);
      expect(await prisma.productPrice.count({ where: { businessId: biz } })).toBe(0);
      expect((await prisma.business.findUniqueOrThrow({ where: { id: biz }, select: { nextOrderNo: true } })).nextOrderNo).toBe(
        before.nextOrderNo,
      );
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('validated');

      const retry = await commit(seller, id);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toMatchObject({ ordersCreated: 2, customersCreated: 2, productsCreated: 2 });
    });

    it('refuses a stale import with 409 import_stale when matching orders were added after the check', async () => {
      const seller = await registerSeller(app, 'stale@imports.test', 'Stale Shop');
      const biz = await businessOf(seller);
      const file = sheet(['Order ID', 'Mobile', 'Item', 'Qty', 'Price'], [['ST-1', '01712345678', 'Saree', 1, 4500]]);
      const columns = { externalRef: 'Order ID', phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' };
      const id = await validated(seller, file, columns);
      await seedOrder(biz, 900100, { externalRef: 'ST-1' });

      const res = await commit(seller, id);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'import_stale',
        message: 'Some orders were added since you checked this file. Check it again.',
      });
      expect(await prisma.order.count({ where: { importId: id } })).toBe(0);
      expect(await prisma.customer.count({ where: { importId: id } })).toBe(0);
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('validated');
    });

    it('creates unmatched products with cost 0 and counts them in missingCostProducts', async () => {
      const seller = await registerSeller(app, 'nocost@imports.test', 'No Cost Shop');
      const priced = await seller.send('post', '/products', { name: 'Priced', sku: 'PRD-0007', sellingPrice: 10000, costPrice: 5000 });
      expect(priced.status).toBe(201);
      const free = await seller.send('post', '/products', { name: 'Gift Box', sellingPrice: 10000, costPrice: 0 });
      expect(free.status).toBe(201);
      const file = sheet(
        ['Date', 'Mobile', 'Item', 'Qty', 'Price'],
        [
          ['05/10/2026', '01712345678', 'Saree', 1, 4500],
          ['03/10/2026', '01812345678', 'saree ', 2, 4000],
          ['04/10/2026', '01912345678', 'Hijab', 1, 450],
          ['06/10/2026', '01912345678', 'gift box', 1, 100],
          ['07/10/2026', '01612345678', 'Priced', 1, 100],
        ],
      );
      const columns = { orderDate: 'Date', phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' };
      const id = await validated(seller, file, columns);
      const res = await commit(seller, id);
      expect(res.status).toBe(200);
      // Saree and Hijab are new at cost 0, Gift Box exists at cost 0; Priced has a cost.
      expect(res.body.data).toEqual({
        ordersCreated: 5,
        customersCreated: 4,
        productsCreated: 2,
        missingCostProducts: 3,
        from: '2026-10-03',
        to: '2026-10-07',
      });

      const created = await prisma.product.findMany({ where: { importId: id }, include: { prices: true }, orderBy: { name: 'asc' } });
      // Next SKUs after the highest PRD- number in use (Gift Box took PRD-0008); the first row's price; one history row from the earliest order.
      expect(created.map((p) => ({ name: p.name, sku: p.sku, sellingPrice: p.sellingPrice, costPrice: p.costPrice }))).toEqual([
        { name: 'Hijab', sku: 'PRD-0010', sellingPrice: 45000, costPrice: 0 },
        { name: 'Saree', sku: 'PRD-0009', sellingPrice: 450000, costPrice: 0 },
      ]);
      expect(created.find((p) => p.name === 'Saree')?.prices).toEqual([
        expect.objectContaining({ sellingPrice: 450000, costPrice: 0, effectiveFrom: new Date('2026-10-03') }),
      ]);
      expect(created.find((p) => p.name === 'Hijab')?.prices).toEqual([expect.objectContaining({ effectiveFrom: new Date('2026-10-04') })]);
      const lines = await prisma.orderItem.findMany({ where: { order: { importId: id } }, orderBy: { unitPrice: 'asc' } });
      expect(lines.every((l) => l.unitCost === 0 || l.productName === 'Priced')).toBe(true);
      expect(lines.filter((l) => l.productName === 'Saree').map((l) => l.unitPrice)).toEqual([400000, 450000]);
      expect(new Set(lines.filter((l) => l.productName === 'Saree').map((l) => l.productId)).size).toBe(1);
      expect(await prisma.productPrice.count({ where: { product: { importId: id } } })).toBe(2);
    });

    it('reuses an existing customer by phone and an existing product by SKU, with dated costs and business defaults', async () => {
      const seller = await registerSeller(app, 'reuse@imports.test', 'Reuse Shop');
      const biz = await businessOf(seller);
      await prisma.business.update({
        where: { id: biz },
        data: { defaultCourierId: null, defaultCourierCost: 12000, defaultPackagingCost: 2000, defaultReturnCost: 8000 },
      });
      const customer = await seller.send('post', '/customers', { name: 'Rahim', phone: '01712345678' });
      expect(customer.status).toBe(201);
      const kept = await seller.send('post', '/customers', { name: 'Karim', phone: '01812345678', address: 'Old address' });
      const silk = await seller.send('post', '/products', {
        name: 'Silk Saree',
        sku: 'sar-1',
        sellingPrice: 400000,
        costPrice: 200000,
        stock: 5,
      });
      const hijab = await seller.send('post', '/products', { name: 'Hijab', sellingPrice: 45000, costPrice: 25000 });
      expect([silk.status, hijab.status]).toEqual([201, 201]);
      // The silk saree cost ৳1,500 in October; today's ৳2,000 applies only from today.
      await prisma.productPrice.create({
        data: {
          businessId: biz,
          productId: silk.body.data.id,
          sellingPrice: 400000,
          costPrice: 150000,
          effectiveFrom: new Date('2026-10-01'),
        },
      });

      const file = sheet(
        ['Date', 'Mobile', 'Name', 'Address', 'Item', 'SKU', 'Qty', 'Price', 'Status'],
        [
          ['15/10/2026', '01712345678', 'Someone Else', 'Mirpur 10', 'Whatever name', 'SAR-1', 1, 4200, 'Delivered'],
          ['16/10/2026', '01812345678', 'Karim B', 'New address', 'HIJAB', '', 2, 450, 'Returned'],
        ],
      );
      const columns = {
        orderDate: 'Date',
        phone: 'Mobile',
        customerName: 'Name',
        address: 'Address',
        product: 'Item',
        sku: 'SKU',
        quantity: 'Qty',
        sellingPrice: 'Price',
        status: 'Status',
      };
      const id = await validated(seller, file, columns, { Delivered: 'delivered', Returned: 'returned' });
      const res = await commit(seller, id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ ordersCreated: 2, customersCreated: 0, productsCreated: 0, missingCostProducts: 0 });

      // An existing customer keeps their name; an empty address is filled in, a filled one is kept.
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.body.data.id } })).toMatchObject({
        name: 'Rahim',
        address: 'Mirpur 10',
        importId: null,
      });
      expect(await prisma.customer.findUniqueOrThrow({ where: { id: kept.body.data.id } })).toMatchObject({
        name: 'Karim',
        address: 'Old address',
      });

      const orders = await prisma.order.findMany({ where: { importId: id }, include: { items: true }, orderBy: { orderDate: 'asc' } });
      const [delivered, returned] = orders;
      expect(delivered).toMatchObject({
        customerId: customer.body.data.id,
        deliveryAddress: 'Mirpur 10',
        courierId: null,
        courierCost: 12000,
        packagingCost: 2000,
        returnCost: 8000,
        productCost: 150000,
        returnedAt: null,
        paymentMethod: 'cod',
      });
      expect(delivered.items[0]).toMatchObject({
        productId: silk.body.data.id,
        productName: 'Silk Saree',
        sku: 'SAR-1',
        unitPrice: 420000,
        unitCost: 150000,
      });
      expect(returned).toMatchObject({
        customerId: kept.body.data.id,
        deliveryAddress: 'New address',
        status: 'returned',
        returnCost: 8000,
      });
      expect(returned.returnedAt).toEqual(new Date('2026-10-16T00:00:00+06:00'));
      expect(returned.deliveredAt).toBeNull();
      expect(returned.items[0]).toMatchObject({ productId: hijab.body.data.id, quantity: 2, unitCost: 25000, lineTotal: 90000 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: silk.body.data.id } })).stock).toBe(5);
    });

    it('answers 409 import_stale, not 500, when a product SKU was taken meanwhile', async () => {
      const seller = await registerSeller(app, 'skurace@imports.test', 'SKU Race Shop');
      const file = sheet(['Mobile', 'Item', 'Qty', 'Price'], [['01712345678', 'Saree', 1, 4500]]);
      const id = await validated(seller, file, { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' });
      // What Postgres reports when another request inserts the same (businessId, sku) first.
      const clash = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`businessId`,`sku`)', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
        meta: { target: ['businessId', 'sku'] },
      });
      const spy = jest.spyOn(app.get(ProductsService), 'resolveForImport').mockRejectedValueOnce(clash);
      const res = await commit(seller, id);
      spy.mockRestore();
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('import_stale');
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('validated');
    });

    it('keeps a SKU and a product name that read alike apart', async () => {
      const seller = await registerSeller(app, 'keys@imports.test', 'Keys Shop');
      const file = sheet(
        ['Mobile', 'Item', 'SKU', 'Qty', 'Price'],
        [
          ['01712345678', 'Scarf', 'hijab', 1, 300],
          ['01812345678', 'Hijab', '', 1, 450],
        ],
      );
      const columns = { phone: 'Mobile', product: 'Item', sku: 'SKU', quantity: 'Qty', sellingPrice: 'Price' };
      const id = await validated(seller, file, columns);
      const res = await commit(seller, id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ ordersCreated: 2, productsCreated: 2 });
      const lines = await prisma.orderItem.findMany({ where: { order: { importId: id } }, orderBy: { unitPrice: 'asc' } });
      expect(lines.map((l) => ({ productName: l.productName, sku: l.sku }))).toEqual([
        { productName: 'Scarf', sku: 'HIJAB' },
        { productName: 'Hijab', sku: expect.stringMatching(/^PRD-\d{4}$/) },
      ]);
      expect(lines[0].productId).not.toBe(lines[1].productId);
    });

    it('imports 5,000 rows from validate through commit in under 20 s', async () => {
      const seller = await registerSeller(app, 'bigcommit@imports.test', 'Big Commit Shop');
      const header = ['Order ID', 'Mobile', 'Item', 'Qty', 'Price', 'Cost', 'Date'];
      // 1,250 two-line orders with an Order ID, then 2,500 single-row orders without; 200 products.
      const aoa = Array.from({ length: 5000 }, (_, i) => {
        const ref = i < 2500 ? `BIG-${Math.floor(i / 2)}` : '';
        const order = i < 2500 ? Math.floor(i / 2) : i;
        return [
          ref,
          `01${7 + (order % 3)}${String(40_000_000 + (order % 1000))}`,
          `Product ${i % 200}`,
          1 + (i % 3),
          500 + (i % 40) * 25,
          i % 7 === 0 ? '' : 300,
          `${String(1 + (order % 28)).padStart(2, '0')}/10/2026`,
        ];
      });
      const columns = {
        externalRef: 'Order ID',
        phone: 'Mobile',
        product: 'Item',
        quantity: 'Qty',
        sellingPrice: 'Price',
        productCost: 'Cost',
        orderDate: 'Date',
      };
      const id = await uploadMapped(seller, sheet(header, aoa), columns);

      const started = Date.now();
      const checked = await seller.send('post', `/imports/${id}/validate`);
      const res = await commit(seller, id);
      const elapsed = Date.now() - started;

      expect(checked.body.data.counts).toEqual({ total: 5000, valid: 5000, duplicate: 0, invalid: 0, orders: 3750 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ ordersCreated: 3750, productsCreated: 200, from: '2026-10-01', to: '2026-10-28' });
      expect(await prisma.orderItem.count({ where: { order: { importId: id } } })).toBe(5000);
      expect(await prisma.orderStatusHistory.count({ where: { order: { importId: id } } })).toBe(3750);
      expect(elapsed).toBeLessThan(20_000);
    }, 60_000);
  });

  describe('imported orders and stock (FR-PROD-07)', () => {
    let seller: Client;
    let sareeId: string;
    let orderIds: Map<string, string>; // phone → order id

    const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: sareeId } })).stock;
    const setStatus = (id: string, status: string) => seller.send('post', `/orders/${id}/status`, { status });

    beforeAll(async () => {
      seller = await registerSeller(app, 'stock@imports.test', 'Stock Shop');
      const saree = await seller.send('post', '/products', { name: 'Saree', sellingPrice: 450000, costPrice: 200000, stock: 10 });
      sareeId = saree.body.data.id as string;
      const file = sheet(
        ['Mobile', 'Item', 'Qty', 'Price', 'Status'],
        [
          ['01711111111', 'Saree', 1, 4500, 'Delivered'],
          ['01722222222', 'Saree', 2, 4500, 'Shipped'],
          ['01733333333', 'Saree', 1, 4500, 'Delivered'],
          ['01744444444', 'Saree', 1, 4500, 'Shipped'],
          ['01755555555', 'Saree', 3, 4500, 'Shipped'],
        ],
      );
      const id = await validated(
        seller,
        file,
        { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price', status: 'Status' },
        { Delivered: 'delivered', Shipped: 'shipped' },
      );
      expect((await commit(seller, id)).body.data).toMatchObject({ ordersCreated: 5, productsCreated: 0 });
      const orders = await prisma.order.findMany({ where: { importId: id }, include: { customer: true } });
      orderIds = new Map(orders.map((o) => [o.customer.phone, o.id]));
      expect(await stock()).toBe(10);
    });

    it('delivered → returned leaves stock unchanged', async () => {
      const before = await stock();
      const res = await setStatus(orderIds.get('01711111111')!, 'returned');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('returned');
      expect(await stock()).toBe(before);
    });

    it('shipped → cancelled leaves stock unchanged', async () => {
      const before = await stock();
      const res = await setStatus(orderIds.get('01722222222')!, 'cancelled');
      expect(res.status).toBe(200);
      expect(await stock()).toBe(before);
    });

    it('an item edit leaves stock unchanged', async () => {
      const id = orderIds.get('01733333333')!;
      const before = await stock();
      const res = await seller.send('patch', `/orders/${id}`, { items: [{ productId: sareeId, quantity: 4 }] });
      expect(res.status).toBe(200);
      expect(res.body.data.items[0].quantity).toBe(4);
      expect(await stock()).toBe(before);
    });

    it('a bulk status change leaves stock unchanged, both ways', async () => {
      const ids = [orderIds.get('01744444444')!, orderIds.get('01755555555')!];
      const before = await stock();
      const cancel = await seller.send('post', '/orders/bulk-status', { orderIds: ids, status: 'cancelled' });
      expect(cancel.body.data).toMatchObject({ updated: 2 });
      expect(await stock()).toBe(before);
      const back = await seller.send('post', '/orders/bulk-status', { orderIds: ids, status: 'confirmed' });
      expect(back.body.data).toMatchObject({ updated: 2 });
      expect(await stock()).toBe(before);
    });

    it('a manual order still takes and gives back stock, also in a bulk change with imported orders', async () => {
      const before = await stock();
      const manual = await seller.send('post', '/orders', {
        customer: { phone: '01766666666' },
        items: [{ productId: sareeId, quantity: 2 }],
      });
      expect(manual.status).toBe(201);
      expect(await stock()).toBe(before - 2);
      const imported = orderIds.get('01744444444')!; // confirmed by the bulk test
      const res = await seller.send('post', '/orders/bulk-status', { orderIds: [manual.body.data.id, imported], status: 'cancelled' });
      expect(res.body.data).toMatchObject({ updated: 2 });
      expect(await stock()).toBe(before);
    });
  });

  describe('undo', () => {
    const UNDO_KEYS = ['customersDeleted', 'ordersDeleted', 'productsDeleted'];
    const undo = (seller: Client, id: string) => seller.send('post', `/imports/${id}/undo`);
    const smallColumns = { phone: 'Mobile', product: 'Item', quantity: 'Qty', sellingPrice: 'Price' };
    const smallFile = () =>
      sheet(
        ['Mobile', 'Item', 'Qty', 'Price'],
        [
          ['01712345678', 'Saree', 1, 4500],
          ['01812345678', 'Hijab', 2, 450],
        ],
      );

    async function imported(seller: Client, file = smallFile(), columns: Record<string, string> = smallColumns) {
      const id = await validated(seller, file, columns);
      expect((await commit(seller, id)).status).toBe(200);
      return id;
    }

    it('undo removes exactly the imported orders (SRS 11.1 item 4)', async () => {
      const seller = await registerSeller(app, 'undo@imports.test', 'Undo Shop');
      const biz = await businessOf(seller);
      for (const [k, ref] of SEED_ORDER_REFS.entries()) await seedOrder(biz, 900001 + k, { externalRef: ref });
      // A manual order made before the import, in the same month.
      const shawl = await seller.send('post', '/products', { name: 'Manual Shawl', sellingPrice: 300000, costPrice: 100000, stock: 5 });
      const manual = await seller.send('post', '/orders', {
        customer: { phone: '01399999999', name: 'Walk-in' },
        items: [{ productId: shawl.body.data.id, quantity: 1 }],
        orderDate: '2026-10-15',
        status: 'delivered',
      });
      expect(manual.status).toBe(201);
      const profit = async () => (await seller.get('/profit/summary?from=2026-10-01&to=2026-10-31')).body.data as ProfitSummaryDto;
      const before = await profit();

      const id = await validated(seller, makeSampleOrders(), SAMPLE_MAPPING.columns, SAMPLE_MAPPING.statuses);
      expect((await commit(seller, id)).body.data.ordersCreated).toBe(225);
      expect((await profit()).statement.productSales).toBe(before.statement.productSales + SAMPLE_TOTALS.sales);

      const res = await undo(seller, id);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(UNDO_KEYS);
      expect(res.body.data).toEqual({ ordersDeleted: 225, customersDeleted: 225, productsDeleted: 9 });

      // Only the imported orders are gone: the manual order and the three earlier ones stay.
      expect(await prisma.order.count({ where: { importId: id } })).toBe(0);
      const left = await prisma.order.findMany({ where: { businessId: biz }, select: { id: true, externalRef: true } });
      expect(left.map((o) => o.id)).toContain(manual.body.data.id);
      expect(left.map((o) => o.externalRef).sort()).toEqual([...SEED_ORDER_REFS, null].sort());
      expect(await prisma.orderItem.count({ where: { businessId: biz } })).toBe(1); // the manual order's line
      expect(await prisma.orderStatusHistory.count({ where: { businessId: biz } })).toBe(1);
      expect(await prisma.customer.count({ where: { importId: id } })).toBe(0);
      expect(await prisma.customer.count({ where: { businessId: biz } })).toBe(2); // Walk-in and the seeded one
      expect(await prisma.product.count({ where: { importId: id } })).toBe(0);
      expect(await prisma.productPrice.count({ where: { businessId: biz, productId: { not: shawl.body.data.id } } })).toBe(0);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: shawl.body.data.id } })).stock).toBe(4); // untouched by undo

      // The import is undone; its rows point at no order; the history list offers no second undo.
      expect((await seller.get(`/imports/${id}`)).body.data.status).toBe('undone');
      expect(await prisma.importRow.count({ where: { importId: id, orderId: { not: null } } })).toBe(0);
      const list = await seller.get('/imports');
      expect(list.body.data).toEqual([expect.objectContaining({ id, status: 'undone', canUndo: false })]);

      // Profit is back to the figure before the import.
      expect(await profit()).toEqual(before);

      // The orders are gone, so the same file is no longer duplicate (only the 3 seeded refs and in-file copies are).
      const again = await validated(seller, makeSampleOrders(), SAMPLE_MAPPING.columns, SAMPLE_MAPPING.statuses);
      expect((await seller.get(`/imports/${again}`)).body.data.counts).toEqual({
        total: 237,
        valid: 225,
        duplicate: 8,
        invalid: 4,
        orders: 225,
      });
    });

    it('401 without a session and 404 for another business, deleting nothing', async () => {
      const seller = await registerSeller(app, 'undo-404@imports.test', 'Undo 404 Shop');
      const id = await imported(seller);
      expect((await undo(new Client(app), id)).status).toBe(401);
      const res = await undo(sellerB, id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('import_not_found');
      expect(await prisma.order.count({ where: { importId: id } })).toBe(2);
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('imported');
    });

    it('keeps a product the import created once a manual order uses it', async () => {
      const seller = await registerSeller(app, 'undo-product@imports.test', 'Undo Product Shop');
      const id = await imported(seller);
      const saree = await prisma.product.findFirstOrThrow({ where: { importId: id, name: 'Saree' } });
      const manual = await seller.send('post', '/orders', {
        customer: { phone: '01399999999' },
        items: [{ productId: saree.id, quantity: 1 }],
      });
      expect(manual.status).toBe(201);

      const res = await undo(seller, id);
      expect(res.body.data).toEqual({ ordersDeleted: 2, customersDeleted: 2, productsDeleted: 1 });
      expect(await prisma.product.findMany({ where: { importId: id }, select: { id: true } })).toEqual([{ id: saree.id }]);
      expect(await prisma.productPrice.count({ where: { productId: saree.id } })).toBe(1);
      expect(await prisma.order.count({ where: { id: manual.body.data.id } })).toBe(1);
    });

    it('keeps a customer the import created once a manual order uses them', async () => {
      const seller = await registerSeller(app, 'undo-customer@imports.test', 'Undo Customer Shop');
      const id = await imported(seller);
      const shawl = await seller.send('post', '/products', { name: 'Shawl', sellingPrice: 300000, costPrice: 100000 });
      const manual = await seller.send('post', '/orders', {
        customer: { phone: '01712345678' },
        items: [{ productId: shawl.body.data.id, quantity: 1 }],
      });
      expect(manual.status).toBe(201);
      const kept = await prisma.customer.findFirstOrThrow({ where: { importId: id, phone: '01712345678' } });
      expect(manual.body.data.customer.id).toBe(kept.id);

      const res = await undo(seller, id);
      expect(res.body.data).toEqual({ ordersDeleted: 2, customersDeleted: 1, productsDeleted: 2 });
      expect(await prisma.customer.findMany({ where: { importId: id }, select: { id: true } })).toEqual([{ id: kept.id }]);
    });

    it('a second undo is 409 import_cannot_undo, and so is undoing an import not yet committed', async () => {
      const seller = await registerSeller(app, 'undo-twice@imports.test', 'Undo Twice Shop');
      const id = await imported(seller);
      expect((await undo(seller, id)).status).toBe(200);
      const again = await undo(seller, id);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('import_cannot_undo');

      const pending = await validated(seller, smallFile(), smallColumns);
      const early = await undo(seller, pending);
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('import_cannot_undo');
      expect((await prisma.import.findUniqueOrThrow({ where: { id: pending } })).status).toBe('validated');
    });

    it('answers 409 import_stale, not 500, when an order line takes one of its products meanwhile', async () => {
      const seller = await registerSeller(app, 'undo-race@imports.test', 'Undo Race Shop');
      const id = await imported(seller);
      const saree = await prisma.product.findFirstOrThrow({ where: { importId: id, name: 'Saree' } });
      const manual = await seller.send('post', '/orders', {
        customer: { phone: '01399999999' },
        items: [{ productId: saree.id, quantity: 1 }],
      });
      expect(manual.status).toBe(201);
      // As if the "no order uses it" check missed that line (an item edit takes no business lock):
      // the delete hits the order_items RESTRICT foreign key for real.
      const spy = jest
        .spyOn(app.get(ProductsService), 'deleteUnusedFromImport')
        .mockImplementationOnce(async (_businessId: string, importId: string, tx: Prisma.TransactionClient) => {
          await tx.$executeRaw`DELETE FROM products WHERE "importId" = ${importId}::uuid`;
          return [];
        });
      const res = await undo(seller, id);
      spy.mockRestore();
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('import_stale');
      expect(await prisma.order.count({ where: { importId: id } })).toBe(2);
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('imported');
    });

    it('rolls back when deleting customers fails: the orders are still there', async () => {
      const seller = await registerSeller(app, 'undo-rollback@imports.test', 'Undo Rollback Shop');
      const id = await imported(seller);
      const spy = jest.spyOn(app.get(CustomersService), 'deleteUnusedFromImport').mockRejectedValueOnce(new Error('disk full'));
      const failed = await undo(seller, id);
      spy.mockRestore();
      expect(failed.status).toBe(500);
      expect(await prisma.order.count({ where: { importId: id } })).toBe(2);
      expect(await prisma.orderItem.count({ where: { order: { importId: id } } })).toBe(2);
      expect(await prisma.customer.count({ where: { importId: id } })).toBe(2);
      expect(await prisma.product.count({ where: { importId: id } })).toBe(2);
      expect(await prisma.importRow.count({ where: { importId: id, orderId: { not: null } } })).toBe(2);
      expect((await prisma.import.findUniqueOrThrow({ where: { id } })).status).toBe('imported');

      const retry = await undo(seller, id);
      expect(retry.status).toBe(200);
      expect(retry.body.data).toEqual({ ordersDeleted: 2, customersDeleted: 2, productsDeleted: 2 });
    });
  });
});
