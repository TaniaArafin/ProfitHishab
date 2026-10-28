import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { ExpensesService } from '../src/modules/expenses/expenses.service';
import { Client, createTestApp, nextPhone, OTP_CODE, registerSeller, tk } from './helpers';

const DAY_MS = 86_400_000;

describe('Registration codes and the 7-day free trial (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const account = (phone: string, code = OTP_CODE) => ({
    name: 'Rahima',
    businessName: 'Rahima Shop',
    phone,
    code,
    password: 'secret-pass-1',
  });

  describe('sending a code', () => {
    it('works without a session, returns only expiresIn and resendIn, and stores only a hash', async () => {
      const phone = nextPhone();
      const res = await new Client(app).send('post', '/auth/otp', { phone });
      expect(res.status).toBe(202);
      expect(Object.keys(res.body.data).sort()).toEqual(['expiresIn', 'resendIn']);
      const row = await prisma.phoneOtp.findFirstOrThrow({ where: { phone } });
      expect(row.codeHash).not.toContain(OTP_CODE);
      expect(row.codeHash).toHaveLength(64);
    });

    it('refuses a second code within a minute, a registered number, and a bad number', async () => {
      const client = new Client(app);
      const phone = nextPhone();
      expect((await client.send('post', '/auth/otp', { phone })).status).toBe(202);
      const again = await client.send('post', '/auth/otp', { phone });
      expect(again.status).toBe(429);
      expect(again.body.error.code).toBe('otp_resend_too_soon');

      const seller = await registerSeller(app, null);
      const taken = await client.send('post', '/auth/otp', { phone: seller.phone });
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('phone_taken');

      expect((await client.send('post', '/auth/otp', { phone: '12345' })).status).toBe(422);
    });
  });

  describe('registering with the code', () => {
    it('needs the code, counts wrong tries, and locks the code after 5', async () => {
      const client = new Client(app);
      const phone = nextPhone();
      await client.send('post', '/auth/otp', { phone });

      const missing = await client.send('post', '/auth/register', { ...account(phone), code: undefined });
      expect(missing.status).toBe(422);
      expect(missing.body.error.fields.code).toBeDefined();

      const first = await client.send('post', '/auth/register', account(phone, '000000'));
      expect(first.status).toBe(422);
      expect(first.body.error).toMatchObject({ code: 'otp_wrong', message: 'That code is not right. 4 tries left.' });
      for (let i = 0; i < 4; i++) await client.send('post', '/auth/register', account(phone, '000000'));

      // Even the right code is refused once the code is locked; nothing was created.
      const locked = await client.send('post', '/auth/register', account(phone));
      expect(locked.body.error.code).toBe('otp_expired');
      expect(await prisma.user.findFirst({ where: { phone } })).toBeNull();
    });

    it('refuses an expired code and a code sent to a different number', async () => {
      const client = new Client(app);
      const phone = nextPhone();
      await client.send('post', '/auth/otp', { phone });
      await prisma.phoneOtp.updateMany({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await client.send('post', '/auth/register', account(phone))).body.error.code).toBe('otp_expired');

      const other = nextPhone();
      const res = await client.send('post', '/auth/register', account(other));
      expect(res.body.error.code).toBe('otp_expired');
      expect(await prisma.user.findFirst({ where: { phone: other } })).toBeNull();
    });

    it('uses the code once, marks the phone verified, and email is optional', async () => {
      const seller = await registerSeller(app, null);
      const otp = await prisma.phoneOtp.findFirstOrThrow({ where: { phone: seller.phone } });
      expect(otp.consumedAt).not.toBeNull();
      const user = await prisma.user.findFirstOrThrow({ where: { phone: seller.phone } });
      expect(user.phoneVerifiedAt).not.toBeNull();
      expect(user.email).toBeNull();
    });

    it('rolls everything back, code included, when registration fails partway', async () => {
      const expenses = app.get(ExpensesService);
      const spy = jest.spyOn(expenses, 'seedDefaultCategories').mockRejectedValueOnce(new Error('boom'));
      const client = new Client(app);
      const phone = nextPhone();
      await client.send('post', '/auth/otp', { phone });

      expect((await client.send('post', '/auth/register', account(phone))).status).toBe(500);
      expect(await prisma.user.findFirst({ where: { phone } })).toBeNull();
      expect(await prisma.trialClaim.findUnique({ where: { phone } })).toBeNull();
      expect((await prisma.phoneOtp.findFirstOrThrow({ where: { phone } })).consumedAt).toBeNull();

      // The same code still works afterwards.
      expect((await client.send('post', '/auth/register', account(phone))).status).toBe(201);
      spy.mockRestore();
    });
  });

  describe('the trial', () => {
    it('gives a new business 7 days and records the phone as having used its trial', async () => {
      const before = Date.now();
      const seller = await registerSeller(app, null);
      const me = await seller.get('/auth/me');
      const endsAt = new Date(me.body.data.business.trialEndsAt).getTime();
      expect(endsAt).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
      expect(endsAt).toBeLessThan(Date.now() + 7 * DAY_MS + 1000);

      const claim = await prisma.trialClaim.findUniqueOrThrow({ where: { phone: seller.phone } });
      expect(claim.businessId).toBe(me.body.data.business.id);
    });

    it('after the trial, reads work, writes get 402, and logging out still works', async () => {
      const seller = await registerSeller(app, null);
      const product = await seller.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) });
      expect(product.status).toBe(201);
      const me = await seller.get('/auth/me');
      await prisma.business.update({ where: { id: me.body.data.business.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

      expect((await seller.get('/products')).status).toBe(200);
      expect((await seller.get('/profit/summary?from=2026-10-01&to=2026-10-31')).status).toBe(200);

      const write = await seller.send('post', '/products', { name: 'Panjabi', sellingPrice: tk(1800), costPrice: tk(900) });
      expect(write.status).toBe(402);
      expect(write.body.error.code).toBe('trial_ended');
      expect((await seller.send('patch', '/business', { name: 'Renamed' })).status).toBe(402);
      expect((await seller.send('patch', `/products/${product.body.data.id}`, { name: 'Renamed' })).status).toBe(402);
      expect(await prisma.product.count({ where: { businessId: me.body.data.business.id } })).toBe(1);

      expect((await seller.send('post', '/auth/logout')).status).toBe(200);
      expect((await seller.get('/auth/me')).status).toBe(401);
    });

    it('never limits an early-access business (no end date)', async () => {
      const seller = await registerSeller(app, null);
      const me = await seller.get('/auth/me');
      await prisma.business.update({ where: { id: me.body.data.business.id }, data: { trialEndsAt: null } });
      const res = await seller.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) });
      expect(res.status).toBe(201);
    });

    it('gives no second trial to a phone whose earlier account was deleted', async () => {
      const first = await registerSeller(app, null);
      const user = await prisma.user.findFirstOrThrow({ where: { phone: first.phone } });
      const firstBusiness = (await first.get('/auth/me')).body.data.business.id as string;
      await prisma.business.delete({ where: { id: firstBusiness } });
      await prisma.user.delete({ where: { id: user.id } });
      expect((await prisma.trialClaim.findUniqueOrThrow({ where: { phone: first.phone } })).businessId).toBeNull();

      // The seller comes back later (past the one-minute resend wait).
      await prisma.phoneOtp.updateMany({ where: { phone: first.phone }, data: { createdAt: new Date(Date.now() - 120_000) } });
      const again = await registerSeller(app, null, 'Second Try', first.phone);
      const me = await again.get('/auth/me');
      expect(new Date(me.body.data.business.trialEndsAt).getTime()).toBeLessThanOrEqual(Date.now());
      const write = await again.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) });
      expect(write.status).toBe(402);
    });
  });
});
