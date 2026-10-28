import './free-mode-env';
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { Client, createTestApp, nextPhone, tk } from './helpers';

const DAY_MS = 86_400_000;

describe('Sign-up without SMS codes (OTP_REQUIRED=false) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const account = { name: 'Rahima', businessName: 'Rahima Shop', password: 'secret-pass-1' };

  it('tells the sign-up form that no code is needed', async () => {
    const res = await new Client(app).get('/auth/signup-options');
    expect(res.body.data).toEqual({ otpRequired: false, trialDays: 7 });
  });

  it('registers with only an email, or only a phone, and starts the 7-day trial', async () => {
    const before = Date.now();
    const byEmail = new Client(app);
    expect((await byEmail.send('post', '/auth/register', { ...account, email: 'free@example.com' })).status).toBe(201);
    const me = await byEmail.get('/auth/me');
    expect(new Date(me.body.data.business.trialEndsAt).getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS);

    const phone = nextPhone();
    expect((await new Client(app).send('post', '/auth/register', { ...account, phone })).status).toBe(201);
    // Not verified, so not remembered: the real owner of the number keeps their trial for later.
    expect((await prisma.user.findFirstOrThrow({ where: { phone } })).phoneVerifiedAt).toBeNull();
    expect(await prisma.trialClaim.findUnique({ where: { phone } })).toBeNull();
  });

  it('needs an email or a phone, and sends no codes (no SMS cost)', async () => {
    const client = new Client(app);
    expect((await client.send('post', '/auth/register', account)).status).toBe(422);
    const otp = await client.send('post', '/auth/otp', { phone: nextPhone() });
    expect(otp.status).toBe(400);
    expect(otp.body.error.code).toBe('otp_not_enabled');
    expect(await prisma.phoneOtp.count()).toBe(0);
  });

  it('makes the account read-only after 7 days, the same as with codes', async () => {
    const seller = new Client(app);
    await seller.send('post', '/auth/register', { ...account, email: 'ended@example.com' });
    const me = await seller.get('/auth/me');
    await prisma.business.update({ where: { id: me.body.data.business.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

    expect((await seller.get('/products')).status).toBe(200);
    const write = await seller.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) });
    expect(write.status).toBe(402);
    expect(write.body.error.code).toBe('trial_ended');
  });

  it('still gives no trial to a number that already had one (verified earlier)', async () => {
    const phone = nextPhone();
    await prisma.trialClaim.create({ data: { phone } });
    const seller = new Client(app);
    expect((await seller.send('post', '/auth/register', { ...account, phone })).status).toBe(201);
    const me = await seller.get('/auth/me');
    expect(new Date(me.body.data.business.trialEndsAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
