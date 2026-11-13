import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/common/prisma.service';
import { envSchema } from '../src/config';
import { AdminService } from '../src/modules/admin/admin.service';
import { Mailer, type Mail } from '../src/modules/auth/mailer';
import { BillingRepository } from '../src/modules/billing/billing.repository';
import { Client, createTestApp, registerSeller, tk } from './helpers';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bizA: string;
  let bizB: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await registerSeller(app, 'a@billing.test', 'Shop A');
    await registerSeller(app, 'b@billing.test', 'Shop B');
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM businesses ORDER BY "createdAt"`;
    [bizA, bizB] = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await app.close();
  });

  const insert = (businessId: string, o: { method?: string; trx?: string; status?: string; months?: number; amount?: number } = {}) =>
    prisma.$executeRaw`
      INSERT INTO payments (id, "businessId", method, "senderNumber", "transactionId", months, amount, status)
      VALUES (${randomUUID()}::uuid, ${businessId}::uuid, ${o.method ?? 'bkash'}, '01712345678', ${o.trx ?? randomUUID().slice(0, 10).toUpperCase()},
        ${o.months ?? 1}, ${o.amount ?? 49900}, ${o.status ?? 'pending'})`;

  describe('database', () => {
    beforeEach(async () => {
      await prisma.$executeRaw`DELETE FROM payments`;
    });

    it('refuses an unknown payment status', async () => {
      await expect(insert(bizA, { status: 'refunded' })).rejects.toThrow(/payments_status_check/);
    });

    it('refuses months 2', async () => {
      await expect(insert(bizA, { months: 2 })).rejects.toThrow(/payments_months_check/);
    });

    it('refuses the same method + transaction ID twice across businesses while pending or confirmed', async () => {
      await insert(bizA, { trx: 'ABCD1234EF', status: 'confirmed' });
      await expect(insert(bizB, { trx: 'ABCD1234EF' })).rejects.toThrow(/23505.*transactionId/);
      await expect(insert(bizB, { trx: 'ABCD1234EF', status: 'confirmed' })).rejects.toThrow(/23505.*transactionId/);
      await insert(bizB, { trx: 'ABCD1234EF', method: 'nagad' }); // other method is fine
      await insert(bizA, { trx: 'FEDC4321BA' }); // pending also claims it
      await expect(insert(bizB, { trx: 'FEDC4321BA', status: 'confirmed' })).rejects.toThrow(/23505.*transactionId/);
    });

    it('TrxID uniqueness is a partial unique index that skips rejected payments (the old full unique is gone)', async () => {
      const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payments' AND indexdef LIKE '%transactionId%'`;
      expect(rows).toEqual([
        {
          indexname: 'payments_method_transactionId_active_key',
          indexdef: expect.stringMatching(/UNIQUE INDEX .*\(method, "transactionId"\) WHERE \(status <> 'rejected'::text\)$/),
        },
      ]);
    });

    it('a rejected payment releases its transaction ID', async () => {
      await insert(bizA, { trx: 'REJECT0001', status: 'rejected' });
      await insert(bizA, { trx: 'REJECT0001', status: 'rejected' }); // any number of rejected rows
      await insert(bizA, { trx: 'REJECT0001' }); // resubmitted by the same business
      await expect(insert(bizB, { trx: 'REJECT0001', status: 'confirmed' })).rejects.toThrow(/23505.*transactionId/);
    });

    it('refuses a second pending payment for one business', async () => {
      await insert(bizA);
      await expect(insert(bizA)).rejects.toThrow(/23505.*businessId/);
      await insert(bizA, { status: 'rejected' }); // history is unlimited
      await insert(bizB); // another business is independent
    });

    it('accepts confirm_payment and reject_payment in admin_actions, and still refuses unknown ones', async () => {
      const add = (action: string) =>
        prisma.$executeRaw`INSERT INTO admin_actions (id, "businessId", action) VALUES (${randomUUID()}::uuid, ${bizA}::uuid, ${action})`;
      await add('confirm_payment');
      await add('reject_payment');
      await expect(add('delete_everything')).rejects.toThrow(/admin_actions_action_check/);
    });
  });

  describe('repository', () => {
    let repo: BillingRepository;
    let userA: string;
    const data = (trx: string, months = 1) => ({
      method: 'bkash' as const,
      senderNumber: '01712345678',
      transactionId: trx,
      months,
      amount: 49900 * months,
    });

    beforeAll(async () => {
      repo = new BillingRepository(prisma);
      const rows = await prisma.$queryRaw<Array<{ ownerId: string }>>`SELECT "ownerId" FROM businesses WHERE id = ${bizA}::uuid`;
      userA = rows[0].ownerId;
    });

    beforeEach(async () => {
      await prisma.$executeRaw`DELETE FROM payments`;
    });

    it('creates a pending payment and scopes reads by business', async () => {
      const p = await repo.create(bizA, userA, data('REPO0001AA'));
      expect(p.status).toBe('pending');
      expect((await repo.pendingFor(bizA))?.id).toBe(p.id);
      expect(await repo.pendingFor(bizB)).toBeNull();
      expect(await repo.recentFor(bizB, 20)).toEqual([]);
    });

    it('lists the newest first and respects the limit', async () => {
      const first = await repo.create(bizA, userA, data('REPO0002AA'));
      await repo.markRejected(first.id, { reviewedById: userA, at: new Date(), reason: 'no match' }, prisma);
      const second = await repo.create(bizA, userA, data('REPO0003AA', 3));
      expect((await repo.recentFor(bizA, 20)).map((r) => r.id)).toEqual([second.id, first.id]);
      expect(await repo.recentFor(bizA, 1)).toHaveLength(1);
    });

    it('confirms and rejects under a row lock, and records who and when', async () => {
      const p = await repo.create(bizA, userA, data('REPO0004AA'));
      const from = new Date('2026-11-11T00:00:00Z');
      const to = new Date('2026-12-11T00:00:00Z');
      await repo.transaction(async (tx) => {
        expect((await repo.lockForUpdate(p.id, tx))?.status).toBe('pending');
        await repo.markConfirmed(p.id, { reviewedById: userA, at: from, periodFrom: from, periodTo: to }, tx);
      });
      const [row] = await repo.recentFor(bizA, 1);
      expect(row).toMatchObject({ status: 'confirmed', periodTo: to, reviewedAt: from });
      expect(await repo.pendingFor(bizA)).toBeNull();
      expect(await repo.lockForUpdate(randomUUID(), prisma)).toBeNull();
    });

    it('rolls a transaction back, leaving the payment pending', async () => {
      const p = await repo.create(bizA, userA, data('REPO0005AA'));
      await expect(
        repo.transaction(async (tx) => {
          await repo.markRejected(p.id, { reviewedById: userA, at: new Date(), reason: 'x' }, tx);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect((await repo.pendingFor(bizA))?.id).toBe(p.id);
    });

    it('the admin queue spans businesses, filters by status and joins names', async () => {
      const a = await repo.create(bizA, userA, data('REPO0006AA'));
      const rows = await prisma.$queryRaw<Array<{ ownerId: string }>>`SELECT "ownerId" FROM businesses WHERE id = ${bizB}::uuid`;
      const b = await repo.create(bizB, rows[0].ownerId, data('REPO0007AA'));
      await repo.markRejected(b.id, { reviewedById: userA, at: new Date(), reason: 'bad id' }, prisma);
      const pending = await repo.paginateForAdmin({ status: 'pending', page: 1, perPage: 25 });
      expect(pending.total).toBe(1);
      expect(pending.rows[0]).toMatchObject({ id: a.id, businessName: 'Shop A', submittedByName: 'Nusrat', reviewedByName: null });
      const rejected = await repo.paginateForAdmin({ status: 'rejected', page: 1, perPage: 25 });
      expect(rejected.rows.map((r) => r.id)).toEqual([b.id]);
      expect(rejected.rows[0]).toMatchObject({ businessName: 'Shop B', reviewedByName: 'Nusrat', rejectReason: 'bad id' });
      expect((await repo.findForAdmin(a.id))?.businessName).toBe('Shop A');
      expect(await repo.findForAdmin(randomUUID())).toBeNull();
    });

    it('the admin queue serves pending oldest first, and confirmed and rejected newest first', async () => {
      const rows = await prisma.$queryRaw<Array<{ ownerId: string }>>`SELECT "ownerId" FROM businesses WHERE id = ${bizB}::uuid`;
      const old = await repo.create(bizA, userA, data('ORDER00001'));
      const recent = await repo.create(bizB, rows[0].ownerId, data('ORDER00002'));
      await prisma.payment.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 2 * DAY_MS) } });
      const pending = await repo.paginateForAdmin({ status: 'pending', page: 1, perPage: 25 });
      expect(pending.rows.map((r) => r.id)).toEqual([old.id, recent.id]);
      expect((await repo.paginateForAdmin({ status: 'pending', page: 1, perPage: 1 })).rows.map((r) => r.id)).toEqual([old.id]);

      for (const p of [old, recent]) await repo.markRejected(p.id, { reviewedById: userA, at: new Date(), reason: 'no match' }, prisma);
      const rejected = await repo.paginateForAdmin({ status: 'rejected', page: 1, perPage: 25 });
      expect(rejected.rows.map((r) => r.id)).toEqual([recent.id, old.id]);
    });
  });

  describe('config', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
    };

    it('production needs at least one receiving number', () => {
      const r = envSchema.safeParse(prod);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.map((i) => i.message)).toContain('production needs at least one receiving number');
        expect(r.error.issues.find((i) => i.message.includes('receiving'))?.path).toEqual(['PAYMENT_BKASH_NUMBER']);
      }
      expect(envSchema.safeParse({ ...prod, PAYMENT_NAGAD_NUMBER: '01800000001' }).success).toBe(true);
    });

    it('rejects a malformed number and a silly price', () => {
      expect(envSchema.safeParse({ ...prod, PAYMENT_BKASH_NUMBER: '12345' }).success).toBe(false);
      expect(envSchema.safeParse({ ...prod, PAYMENT_BKASH_NUMBER: '01700000001', PLAN_PRICE_TAKA: '0' }).success).toBe(false);
    });
  });
  describe('API', () => {
    let admin: Client;
    let sent: Mail[];
    let sellerSeq = 0;
    let trxSeq = 0;

    type Seller = Client & { phone: string; businessId: string; email: string; name: string };
    const seller = async (): Promise<Seller> => {
      sellerSeq += 1;
      const email = `seller${sellerSeq}@billing.test`;
      const name = `Seller Shop ${sellerSeq}`;
      const client = await registerSeller(app, email, name);
      const businessId = (await client.get('/auth/me')).body.data.business.id as string;
      return Object.assign(client, { businessId, email, name });
    };
    const nextTrx = () => `TRX${String(++trxSeq).padStart(7, '0')}`;
    const submit = (c: Client, o: { method?: string; months?: number; transactionId?: string } = {}) =>
      c.send('post', '/billing/payments', { method: 'bkash', months: 1, senderNumber: '01712345678', transactionId: nextTrx(), ...o });
    const setEnd = (businessId: string, trialEndsAt: Date | null) =>
      prisma.business.update({ where: { id: businessId }, data: { trialEndsAt } });
    const endOf = async (businessId: string) =>
      (await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { trialEndsAt: true } })).trialEndsAt;
    const confirm = (id: string) => admin.send('post', `/admin/payments/${id}/confirm`);
    const reject = (id: string, reason = 'TrxID not found in our bKash statement') =>
      admin.send('post', `/admin/payments/${id}/reject`, { reason });
    const actionsOf = (businessId: string, action: string) =>
      prisma.adminAction.findMany({ where: { businessId, action }, select: { adminUserId: true, details: true } });

    const PAYMENT_KEYS = [
      'amount',
      'createdAt',
      'id',
      'method',
      'months',
      'periodTo',
      'rejectReason',
      'reviewedAt',
      'senderNumber',
      'status',
      'transactionId',
    ];

    beforeAll(async () => {
      admin = await registerSeller(app, 'staff@billing.test', 'Staff Shop');
      expect(await app.get(AdminService).grant('staff@billing.test', true)).not.toBeNull();
      jest.spyOn(app.get(Mailer), 'send').mockImplementation((mail: Mail) => {
        sent.push(mail);
        return Promise.resolve();
      });
    });

    beforeEach(async () => {
      await prisma.$executeRaw`DELETE FROM payments`;
      sent = [];
    });

    it('401 anonymous on every billing route', async () => {
      const anon = new Client(app);
      const id = randomUUID();
      expect((await anon.get('/billing')).status).toBe(401);
      expect((await submit(anon)).status).toBe(401);
      expect((await anon.get('/admin/payments')).status).toBe(401);
      expect((await anon.send('post', `/admin/payments/${id}/confirm`)).status).toBe(401);
      expect((await anon.send('post', `/admin/payments/${id}/reject`, { reason: 'nope nope' })).status).toBe(401);
    });

    it('404 for a seller on /admin/payments', async () => {
      const s = await seller();
      const p = await submit(s);
      expect((await s.get('/admin/payments')).status).toBe(404);
      expect((await s.send('post', `/admin/payments/${p.body.data.id}/confirm`)).status).toBe(404);
      expect((await s.send('post', `/admin/payments/${p.body.data.id}/reject`, { reason: 'nope nope' })).status).toBe(404);
      expect((await s.get('/billing')).body.data.pending.status).toBe('pending');
    });

    it('GET /billing shows price 49900, both methods with their numbers, monthOptions [1,3,6,12], trial status and days left', async () => {
      const s = await seller();
      const res = await s.get('/billing');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['accessEndsAt', 'daysLeft', 'firstPaidAt', 'methods', 'monthOptions', 'payments', 'pending', 'pricePerMonth', 'status'].sort(),
      );
      expect(res.body.data).toMatchObject({
        status: 'trial',
        daysLeft: 7,
        pricePerMonth: 49900,
        monthOptions: [1, 3, 6, 12],
        methods: [
          { method: 'bkash', number: '01700000001' },
          { method: 'nagad', number: '01800000001' },
        ],
        pending: null,
        payments: [],
        firstPaidAt: null,
      });
      expect(res.body.data.accessEndsAt).toBe((await endOf(s.businessId))?.toISOString());
    });

    it('submits a payment with amount = 49900 × months, status pending', async () => {
      const s = await seller();
      const res = await submit(s, { months: 3, transactionId: ' 8n7a6d5c4b ' });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(PAYMENT_KEYS);
      expect(res.body.data).toMatchObject({
        method: 'bkash',
        months: 3,
        amount: 49900 * 3,
        status: 'pending',
        transactionId: '8N7A6D5C4B',
        senderNumber: '01712345678',
        periodTo: null,
        reviewedAt: null,
        rejectReason: null,
      });

      const billing = await s.get('/billing');
      expect(billing.body.data.pending).toEqual(res.body.data);
      expect(billing.body.data.payments).toEqual([res.body.data]);
      expect(JSON.stringify(billing.body)).not.toMatch(/submittedById|reviewedById|businessId/);
    });

    it('validates the payment: months 2 and a malformed TrxID are 422', async () => {
      const s = await seller();
      expect((await submit(s, { months: 2 })).status).toBe(422);
      expect((await submit(s, { transactionId: 'abc' })).status).toBe(422);
      expect((await submit(s, { method: 'rocket' })).status).toBe(422);
    });

    it('a second payment while one is pending is 409 payment_pending', async () => {
      const s = await seller();
      expect((await submit(s)).status).toBe(201);
      const second = await submit(s);
      expect(second.status).toBe(409);
      expect(second.body.error).toMatchObject({ code: 'payment_pending', message: 'You already sent a payment. We will check it soon.' });
      expect((await s.get('/billing')).body.data.payments).toHaveLength(1);
    });

    it('two payments sent at once (a retried request) leave one pending and the other 409 payment_pending', async () => {
      const s = await seller();
      const results = await Promise.all([submit(s), submit(s), submit(s)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe('payment_pending');
      expect((await s.get('/billing')).body.data.payments).toHaveLength(1);
    });

    it('the same TrxID from another business, lower-case, is 409 transaction_used', async () => {
      const a = await seller();
      const b = await seller();
      expect((await submit(a, { transactionId: '8N7A6D5C4B' })).status).toBe(201);
      const res = await submit(b, { transactionId: '8n7a6d5c4b' });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({ code: 'transaction_used', message: 'This transaction ID was already used.' });
      // The same TrxID on the other method is a different transaction.
      expect((await submit(b, { method: 'nagad', transactionId: '8n7a6d5c4b' })).status).toBe(201);
    });

    it('a TrxID confirmed for another business stays 409 transaction_used', async () => {
      const a = await seller();
      const b = await seller();
      const p = await submit(a, { transactionId: 'CONF000001' });
      expect((await confirm(p.body.data.id)).status).toBe(200);
      const res = await submit(b, { transactionId: 'CONF000001' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('transaction_used');
      expect((await b.get('/billing')).body.data.payments).toEqual([]);
    });

    it('after a reject the seller can resubmit the same TrxID, which then blocks other businesses again', async () => {
      const a = await seller();
      const b = await seller();
      const first = await submit(a, { months: 3, transactionId: 'RESUB00001' });
      expect((await reject(first.body.data.id, 'You paid for 1 month, not 3')).status).toBe(200);
      const again = await submit(a, { months: 1, transactionId: 'resub00001' });
      expect(again.status).toBe(201);
      expect(again.body.data).toMatchObject({ status: 'pending', transactionId: 'RESUB00001', months: 1 });
      const other = await submit(b, { transactionId: 'RESUB00001' });
      expect(other.status).toBe(409);
      expect(other.body.error.code).toBe('transaction_used');
      expect((await a.get('/billing')).body.data.payments.map((x: { status: string }) => x.status)).toEqual(['pending', 'rejected']);
    });

    it('submitting works after the trial ended (not 402)', async () => {
      const s = await seller();
      await setEnd(s.businessId, new Date(Date.now() - 1000));
      expect((await s.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) })).status).toBe(402);
      expect((await submit(s)).status).toBe(201);
      expect((await s.get('/billing')).body.data).toMatchObject({ status: 'ended', daysLeft: 0 });
    });

    it('confirm extends access from the current end', async () => {
      const s = await seller();
      const now = Date.now();
      await setEnd(s.businessId, new Date(now + 2 * DAY_MS));
      const p = await submit(s);
      const res = await confirm(p.body.data.id);
      expect(res.status).toBe(200);
      const end = (await endOf(s.businessId))!.getTime();
      expect(Math.abs(end - (now + 32 * DAY_MS))).toBeLessThan(MINUTE_MS);
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: p.body.data.id }, select: { periodFrom: true } });
      expect(Math.abs(stored.periodFrom!.getTime() - (now + 2 * DAY_MS))).toBeLessThan(MINUTE_MS); // ≈ the old end

      expect(Object.keys(res.body.data).sort()).toEqual([...PAYMENT_KEYS, 'business', 'reviewedBy', 'submittedBy'].sort());
      expect(res.body.data).toMatchObject({
        id: p.body.data.id,
        status: 'confirmed',
        periodTo: new Date(end).toISOString(),
        business: { id: s.businessId, name: s.name },
        submittedBy: 'Nusrat',
        reviewedBy: 'Nusrat',
      });
      expect(res.body.data.reviewedAt).not.toBeNull();
    });

    it('confirm on an ended trial starts from now', async () => {
      const s = await seller();
      await setEnd(s.businessId, new Date(Date.now() - 5 * DAY_MS));
      const product = { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) };
      expect((await s.send('post', '/products', product)).status).toBe(402);
      const p = await submit(s, { months: 1 });
      const now = Date.now();
      expect((await confirm(p.body.data.id)).status).toBe(200);
      const end = (await endOf(s.businessId))!.getTime();
      expect(Math.abs(end - (now + 30 * DAY_MS))).toBeLessThan(MINUTE_MS);
      // Same session: access is read on every request, no new login needed.
      expect((await s.send('post', '/products', product)).status).toBe(201);
      expect((await s.get('/billing')).body.data).toMatchObject({ status: 'trial', daysLeft: 30, pending: null });
    });

    it('confirm keeps an unlimited business unlimited', async () => {
      const s = await seller();
      await setEnd(s.businessId, null);
      const p = await submit(s, { months: 12 });
      const res = await confirm(p.body.data.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'confirmed', periodTo: null, amount: 49900 * 12 });
      expect(await endOf(s.businessId)).toBeNull();
      const stored = await prisma.payment.findUniqueOrThrow({
        where: { id: p.body.data.id },
        select: { periodFrom: true, periodTo: true },
      });
      expect(stored).toEqual({ periodFrom: null, periodTo: null });
      expect((await s.get('/billing')).body.data).toMatchObject({ status: 'unlimited', accessEndsAt: null, daysLeft: null });
    });

    it('a second confirm is 409 payment_already_reviewed and access moved only once', async () => {
      const s = await seller();
      const before = (await endOf(s.businessId))!.getTime();
      const p = await submit(s);
      // A double click: both requests at once. The payment row lock lets only one through.
      const results = await Promise.all([confirm(p.body.data.id), confirm(p.body.data.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)?.body.error.code).toBe('payment_already_reviewed');
      const third = await confirm(p.body.data.id);
      expect(third.status).toBe(409);
      expect(third.body.error.code).toBe('payment_already_reviewed');
      expect((await reject(p.body.data.id)).status).toBe(409);
      expect((await endOf(s.businessId))!.getTime()).toBe(before + 30 * DAY_MS);
      expect(await actionsOf(s.businessId, 'confirm_payment')).toHaveLength(1);
    });

    it('confirm of an unknown payment is 404 payment_not_found', async () => {
      const res = await confirm(randomUUID());
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('payment_not_found');
      expect((await reject(randomUUID())).body.error.code).toBe('payment_not_found');
    });

    it('confirm sets firstPaidAt once', async () => {
      const s = await seller();
      expect((await s.get('/auth/me')).body.data.business.firstPaidAt).toBeNull();
      const first = await submit(s);
      await confirm(first.body.data.id);
      const firstPaidAt = (await s.get('/auth/me')).body.data.business.firstPaidAt as string;
      expect((await s.get('/billing')).body.data.firstPaidAt).toBe(firstPaidAt);
      expect(Math.abs(new Date(firstPaidAt).getTime() - Date.now())).toBeLessThan(MINUTE_MS);

      const second = await submit(s);
      await confirm(second.body.data.id);
      expect((await s.get('/auth/me')).body.data.business.firstPaidAt).toBe(firstPaidAt);
    });

    it('confirm writes a confirm_payment admin action and emails the owner a receipt with ৳499', async () => {
      const s = await seller();
      const p = await submit(s);
      const res = await confirm(p.body.data.id);
      expect(res.status).toBe(200);

      const adminUserId = (await admin.get('/auth/me')).body.data.user.id;
      const actions = await actionsOf(s.businessId, 'confirm_payment');
      expect(actions).toHaveLength(1);
      expect(actions[0].adminUserId).toBe(adminUserId);
      expect(actions[0].details).toMatchObject({ paymentId: p.body.data.id, amount: 49900, months: 1, to: res.body.data.periodTo });
      expect(typeof (actions[0].details as { from: unknown }).from).toBe('string');

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe(s.email);
      expect(sent[0].subject).toBe('ProfitHishab payment confirmed');
      expect(sent[0].text).toContain('৳499');
      expect(sent[0].text).toContain('1 month');
      expect(sent[0].html).toContain('৳499');
    });

    it('a failed receipt email does not undo the confirmation', async () => {
      const s = await seller();
      const p = await submit(s);
      jest.spyOn(app.get(Mailer), 'send').mockRejectedValueOnce(new Error('smtp down'));
      expect((await confirm(p.body.data.id)).status).toBe(200);
      expect((await s.get('/billing')).body.data.payments[0].status).toBe('confirmed');
    });

    it('reject keeps access unchanged, records the reason, and lets the seller submit again', async () => {
      const s = await seller();
      const before = await endOf(s.businessId);
      const p = await submit(s);
      expect((await reject(p.body.data.id, 'x')).status).toBe(422);
      const res = await reject(p.body.data.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'rejected', rejectReason: 'TrxID not found in our bKash statement', periodTo: null });
      expect(await endOf(s.businessId)).toEqual(before);
      const actions = await actionsOf(s.businessId, 'reject_payment');
      expect(actions).toHaveLength(1);
      expect(actions[0].details).toEqual({ paymentId: p.body.data.id, reason: 'TrxID not found in our bKash statement' });
      expect(sent).toHaveLength(0);

      const billing = (await s.get('/billing')).body.data;
      expect(billing.pending).toBeNull();
      expect(billing.payments[0]).toMatchObject({ status: 'rejected', rejectReason: 'TrxID not found in our bKash statement' });
      expect((await submit(s)).status).toBe(201);
      expect((await reject(p.body.data.id)).status).toBe(409);
    });

    it('rolls back when recording the admin action fails', async () => {
      const s = await seller();
      const before = await endOf(s.businessId);
      const p = await submit(s);
      const spy = jest.spyOn(app.get(AdminService), 'recordAction').mockRejectedValueOnce(new Error('boom'));
      const res = await confirm(p.body.data.id);
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect((await s.get('/billing')).body.data.pending?.id).toBe(p.body.data.id);
      expect(await endOf(s.businessId)).toEqual(before);
      expect((await s.get('/auth/me')).body.data.business.firstPaidAt).toBeNull();
      expect(sent).toHaveLength(0);
      // Repeat-safe: the admin can simply try again.
      expect((await confirm(p.body.data.id)).status).toBe(200);
    });

    it("a seller never sees another business's payments", async () => {
      const a = await seller();
      const b = await seller();
      await submit(a);
      const billing = (await b.get('/billing')).body.data;
      expect(billing.pending).toBeNull();
      expect(billing.payments).toEqual([]);
      expect((await submit(b)).status).toBe(201);
      expect((await a.get('/billing')).body.data.payments).toHaveLength(1);
    });

    it('admin list filters by status and shows business name and amount', async () => {
      const a = await seller();
      const b = await seller();
      const pa = await submit(a, { months: 6 });
      const pb = await submit(b);
      await reject(pb.body.data.id);

      const pending = await admin.get('/admin/payments');
      expect(pending.status).toBe(200);
      expect(pending.body.meta).toEqual({ page: 1, perPage: 25, total: 1 });
      expect(pending.body.data.map((p: { id: string }) => p.id)).toEqual([pa.body.data.id]);
      expect(pending.body.data[0]).toMatchObject({
        amount: 49900 * 6,
        months: 6,
        business: { id: a.businessId, name: a.name },
        submittedBy: 'Nusrat',
        reviewedBy: null,
      });
      expect(JSON.stringify(pending.body)).not.toMatch(/submittedById|reviewedById|"businessId"/);

      const rejected = await admin.get('/admin/payments?status=rejected');
      expect(rejected.body.data.map((p: { id: string }) => p.id)).toEqual([pb.body.data.id]);
      expect((await admin.get('/admin/payments?status=confirmed')).body.data).toEqual([]);
      expect((await admin.get('/admin/payments?status=refunded')).status).toBe(422);
    });
  });
});
