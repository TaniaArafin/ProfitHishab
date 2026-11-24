import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { Client, createTestApp, nextPhone, registerSeller } from './helpers';

const PASSWORD = 'secret-pass-1';

/** FR-AUTH-09: edit name, email and phone; change the password with the current one. */
describe('Account settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(identifier: string, password = PASSWORD): Promise<Client & { status: number }> {
    const client = new Client(app);
    const res = await client.send('post', '/auth/login', { identifier, password });
    return Object.assign(client, { status: res.status });
  }

  describe('PATCH /auth/me', () => {
    it('401 without a session', async () => {
      expect((await new Client(app).send('patch', '/auth/me', { name: 'X' })).status).toBe(401);
    });

    it('updates name, email and phone, and returns only the public user fields', async () => {
      const seller = await registerSeller(app, 'edit@account.test');
      const phone = nextPhone();
      const res = await seller.send('patch', '/auth/me', { name: 'Nusrat Jahan', email: 'New@Account.test', phone });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['email', 'id', 'isPlatformAdmin', 'locale', 'name', 'phone']);
      expect(res.body.data).toMatchObject({ name: 'Nusrat Jahan', email: 'new@account.test', phone });
      expect((await seller.get('/auth/me')).body.data.user).toMatchObject({ name: 'Nusrat Jahan', email: 'new@account.test', phone });
      // A changed phone was never confirmed by SMS.
      expect((await prisma.user.findFirstOrThrow({ where: { phone } })).phoneVerifiedAt).toBeNull();
    });

    it('leaves omitted fields untouched', async () => {
      const seller = await registerSeller(app, 'omit@account.test');
      const res = await seller.send('patch', '/auth/me', { name: 'Only Name' });
      expect(res.body.data).toMatchObject({ name: 'Only Name', email: 'omit@account.test', phone: seller.phone });
    });

    it("409 for another user's email or phone", async () => {
      const taken = await registerSeller(app, 'taken@account.test');
      const seller = await registerSeller(app, 'mine@account.test');
      const email = await seller.send('patch', '/auth/me', { email: 'TAKEN@account.test' });
      expect(email.status).toBe(409);
      expect(email.body.error.code).toBe('email_taken');
      expect(email.body.error.fields.email).toBeDefined();
      const phone = await seller.send('patch', '/auth/me', { phone: taken.phone });
      expect(phone.status).toBe(409);
      expect(phone.body.error.code).toBe('phone_taken');
      expect((await seller.get('/auth/me')).body.data.user.email).toBe('mine@account.test');
    });

    it('keeps own email without a conflict', async () => {
      const seller = await registerSeller(app, 'own@account.test');
      const res = await seller.send('patch', '/auth/me', { email: 'OWN@account.test', phone: seller.phone });
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('own@account.test');
    });

    it('422 when clearing the email (the only way to reset a password)', async () => {
      const seller = await registerSeller(app, 'clear@account.test');
      const res = await seller.send('patch', '/auth/me', { email: '' });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.email).toBeDefined();
      expect((await seller.get('/auth/me')).body.data.user.email).toBe('clear@account.test');
    });

    it('lets an older phone-only account edit its name without adding an email', async () => {
      const seller = await registerSeller(app, 'legacy@account.test');
      await prisma.user.update({ where: { email: 'legacy@account.test' }, data: { email: null } });
      // The settings form always sends all three fields, so the empty email arrives as ''.
      const res = await seller.send('patch', '/auth/me', { name: 'Legacy Seller', email: '', phone: seller.phone });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'Legacy Seller', email: null, phone: seller.phone });
      // But it still cannot drop its only way to log in.
      expect((await seller.send('patch', '/auth/me', { phone: '' })).status).toBe(422);
    });

    it('clears the phone with an empty string', async () => {
      const seller = await registerSeller(app, 'nophone@account.test');
      const res = await seller.send('patch', '/auth/me', { phone: '' });
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBeNull();
    });

    it('422 for a bad email or phone', async () => {
      const seller = await registerSeller(app, 'bad@account.test');
      expect((await seller.send('patch', '/auth/me', { email: 'not-an-email' })).status).toBe(422);
      expect((await seller.send('patch', '/auth/me', { phone: '12345' })).status).toBe(422);
    });

    it('works after the trial ends', async () => {
      const seller = await registerSeller(app, 'ended@account.test');
      const businessId = (await seller.get('/auth/me')).body.data.business.id as string;
      await prisma.business.update({ where: { id: businessId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      expect((await seller.send('patch', '/auth/me', { name: 'Still Me' })).status).toBe(200);
    });
  });

  describe('POST /auth/password/change', () => {
    it('401 without a session', async () => {
      const res = await new Client(app).send('post', '/auth/password/change', { currentPassword: PASSWORD, newPassword: 'new-pass-123' });
      expect(res.status).toBe(401);
    });

    it('422 wrong_password for a wrong current password, and the password stays the same', async () => {
      const seller = await registerSeller(app, 'wrong@account.test');
      const res = await seller.send('post', '/auth/password/change', { currentPassword: 'not-my-pass', newPassword: 'new-pass-123' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('wrong_password');
      expect(res.body.error.fields.currentPassword).toEqual(['Your current password is not right.']);
      expect((await login('wrong@account.test')).status).toBe(200);
    });

    it('422 for a new password under 8 characters', async () => {
      const seller = await registerSeller(app, 'short@account.test');
      const res = await seller.send('post', '/auth/password/change', { currentPassword: PASSWORD, newPassword: '1234567' });
      expect(res.status).toBe(422);
      expect(res.body.error.fields.newPassword).toBeDefined();
    });

    it('revokes other sessions but keeps this one', async () => {
      await registerSeller(app, 'devices@account.test');
      const a = await login('devices@account.test');
      const b = await login('devices@account.test');
      expect([a.status, b.status]).toEqual([200, 200]);

      const res = await a.send('post', '/auth/password/change', { currentPassword: PASSWORD, newPassword: 'new-pass-123' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { ok: true } });

      expect((await a.get('/auth/me')).status).toBe(200);
      expect((await b.get('/auth/me')).status).toBe(401);
      expect((await login('devices@account.test', 'new-pass-123')).status).toBe(200);
      expect((await login('devices@account.test')).status).toBe(401);
    });

    it('works after the trial ends', async () => {
      const seller = await registerSeller(app, 'ended-pw@account.test');
      const businessId = (await seller.get('/auth/me')).body.data.business.id as string;
      await prisma.business.update({ where: { id: businessId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
      const res = await seller.send('post', '/auth/password/change', { currentPassword: PASSWORD, newPassword: 'new-pass-123' });
      expect(res.status).toBe(200);
    });
  });
});
