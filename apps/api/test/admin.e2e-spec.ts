import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { Client, createTestApp, registerSeller, tk } from './helpers';

const DAY_MS = 86_400_000;

describe('Platform admin panel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Client;
  let seller: Client & { phone: string };
  let sellerBusinessId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    admin = await registerSeller(app, 'staff@profithishab.test', 'Staff Shop');
    expect(await app.get(AdminService).grant('staff@profithishab.test', true)).not.toBeNull();
    seller = await registerSeller(app, 'seller@example.com', 'Nusrat Fashion');
    sellerBusinessId = (await seller.get('/auth/me')).body.data.business.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const businessOf = async (client: Client) => (await client.get('/auth/me')).body.data.business.id as string;

  describe('who can use it', () => {
    it('refuses anonymous visitors (401) and sellers (404, so the panel is not revealed)', async () => {
      expect((await new Client(app).get('/admin/businesses')).status).toBe(401);
      const asSeller = await seller.get('/admin/businesses');
      expect(asSeller.status).toBe(404);
      expect((await seller.get(`/admin/businesses/${sellerBusinessId}`)).status).toBe(404);
      expect((await seller.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'unlimited' })).status).toBe(404);
      expect((await seller.send('post', `/admin/businesses/${sellerBusinessId}/reset-link`)).status).toBe(404);
    });

    it('tells the web app who is an admin, and never exposes secrets', async () => {
      expect((await admin.get('/auth/me')).body.data.user.isPlatformAdmin).toBe(true);
      expect((await seller.get('/auth/me')).body.data.user.isPlatformAdmin).toBe(false);
      const list = await admin.get('/admin/businesses');
      expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|tokenHash|codeHash/);
    });

    it('gives the admin unlimited access to their own business, so the panel keeps working', async () => {
      expect((await admin.get('/auth/me')).body.data.business.trialEndsAt).toBeNull();
    });
  });

  describe('the list', () => {
    it('shows every business with owner, status, days left and order count, in the documented shape', async () => {
      await seller.send('post', '/products', { name: 'Saree', sellingPrice: tk(2500), costPrice: tk(1350) });
      const res = await admin.get('/admin/businesses');
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ page: 1, perPage: 25 });
      const row = res.body.data.find((b: { id: string }) => b.id === sellerBusinessId);
      expect(Object.keys(row).sort()).toEqual(
        ['createdAt', 'daysLeft', 'id', 'lastActiveAt', 'name', 'orderCount', 'owner', 'status', 'trialEndsAt'].sort(),
      );
      expect(Object.keys(row.owner).sort()).toEqual(['email', 'id', 'name', 'phone', 'phoneVerified']);
      expect(row).toMatchObject({ name: 'Nusrat Fashion', status: 'trial', daysLeft: 7, orderCount: 0 });
      expect(row.owner).toMatchObject({ email: 'seller@example.com', phone: seller.phone, phoneVerified: true });
    });

    it('filters by status and search, including only matches', async () => {
      const ended = await registerSeller(app, 'ended@example.com', 'Ended Shop');
      await prisma.business.update({ where: { id: await businessOf(ended) }, data: { trialEndsAt: new Date(Date.now() - 1000) } });

      const endedList = await admin.get('/admin/businesses?status=ended');
      expect(endedList.body.data.map((b: { name: string }) => b.name)).toEqual(['Ended Shop']);
      const unlimited = await admin.get('/admin/businesses?status=unlimited');
      expect(unlimited.body.data.map((b: { name: string }) => b.name)).toEqual(['Staff Shop']);

      expect((await admin.get('/admin/businesses?q=fashion')).body.data.map((b: { name: string }) => b.name)).toEqual(['Nusrat Fashion']);
      expect((await admin.get('/admin/businesses?q=ended@example')).body.data).toHaveLength(1);
      expect((await admin.get(`/admin/businesses?q=${seller.phone.slice(-6)}`)).body.data[0].id).toBe(sellerBusinessId);
      expect((await admin.get('/admin/businesses?q=no-such-shop')).body.data).toEqual([]);
      expect((await admin.get('/admin/businesses?status=forever')).status).toBe(422);
    });

    it('pages the list', async () => {
      const res = await admin.get('/admin/businesses?perPage=1&page=2');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('changing access', () => {
    it('extends, sets an end date, makes unlimited and ends access, and records each change', async () => {
      const before = new Date((await admin.get(`/admin/businesses/${sellerBusinessId}`)).body.data.trialEndsAt).getTime();
      const extended = await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'extend', days: 14 });
      expect(extended.status).toBe(200);
      expect(new Date(extended.body.data.trialEndsAt).getTime()).toBe(before + 14 * DAY_MS);

      const until = await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'until', date: '2030-01-31' });
      expect(until.body.data.trialEndsAt).toBe('2030-01-31T17:59:59.999Z');

      const unlimited = await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'unlimited' });
      expect(unlimited.body.data).toMatchObject({ status: 'unlimited', trialEndsAt: null, daysLeft: null });

      const ended = await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'end' });
      expect(ended.body.data.status).toBe('ended');
      const write = await seller.send('post', '/products', { name: 'Panjabi', sellingPrice: tk(1800), costPrice: tk(900) });
      expect(write.status).toBe(402);

      const actions = ended.body.data.actions as Array<{ action: string; details: { mode: string }; adminName: string }>;
      expect(actions.map((a) => a.details.mode)).toEqual(['end', 'unlimited', 'until', 'extend']);
      expect(actions[0]).toMatchObject({ action: 'set_access', adminName: 'Nusrat' });

      await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'extend', days: 7 });
      expect((await seller.send('post', '/products', { name: 'Panjabi', sellingPrice: tk(1800), costPrice: tk(900) })).status).toBe(201);
    });

    it('refuses bad input and an unknown business', async () => {
      expect((await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'extend', days: 0 })).status).toBe(422);
      const unknown = '00000000-0000-7000-8000-000000000000';
      expect((await admin.send('post', `/admin/businesses/${unknown}/access`, { mode: 'unlimited' })).status).toBe(404);
      expect((await admin.get(`/admin/businesses/${unknown}`)).status).toBe(404);
      expect((await admin.get('/admin/businesses/not-a-uuid')).status).toBe(400);
    });

    it('records nothing when the change fails partway', async () => {
      const service = app.get(AdminService);
      const repo = (service as unknown as { repo: { logAction: () => Promise<void> } }).repo;
      const spy = jest.spyOn(repo, 'logAction').mockRejectedValueOnce(new Error('boom'));
      const before = (await admin.get(`/admin/businesses/${sellerBusinessId}`)).body.data;

      expect((await admin.send('post', `/admin/businesses/${sellerBusinessId}/access`, { mode: 'unlimited' })).status).toBe(500);
      const after = (await admin.get(`/admin/businesses/${sellerBusinessId}`)).body.data;
      expect(after.trialEndsAt).toBe(before.trialEndsAt);
      expect(after.actions).toHaveLength(before.actions.length);
      spy.mockRestore();
    });
  });

  describe('blocking', () => {
    it('logs everyone out, refuses login, and lets them back in after unblocking', async () => {
      const target = await registerSeller(app, 'abuse@example.com', 'Abuse Shop');
      const id = await businessOf(target);

      expect((await admin.send('post', `/admin/businesses/${id}/block`, { reason: 'x' })).status).toBe(422);
      const blocked = await admin.send('post', `/admin/businesses/${id}/block`, { reason: 'Fake orders' });
      expect(blocked.body.data).toMatchObject({ status: 'blocked', blockedReason: 'Fake orders' });

      expect((await target.get('/auth/me')).status).toBe(401);
      const login = await new Client(app).send('post', '/auth/login', { identifier: 'abuse@example.com', password: 'secret-pass-1' });
      expect(login.status).toBe(403);
      expect(login.body.error.code).toBe('account_blocked');

      const unblocked = await admin.send('post', `/admin/businesses/${id}/unblock`);
      expect(unblocked.body.data.status).toBe('trial');
      expect(unblocked.body.data.actions.map((a: { action: string }) => a.action)).toEqual(['unblock', 'block']);
      expect(
        (await new Client(app).send('post', '/auth/login', { identifier: 'abuse@example.com', password: 'secret-pass-1' })).status,
      ).toBe(200);
    });

    it('refuses a session of a business blocked while it was open', async () => {
      const target = await registerSeller(app, 'open@example.com', 'Open Shop');
      await prisma.business.update({ where: { id: await businessOf(target) }, data: { blockedAt: new Date() } });
      const res = await target.get('/products');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('account_blocked');
    });

    it("won't let an admin block their own business", async () => {
      const res = await admin.send('post', `/admin/businesses/${await businessOf(admin)}/block`, { reason: 'Oops, mine' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('cannot_block_own_business');
    });
  });

  describe('password reset link', () => {
    it('gives the admin a working one-time link for the owner, and logs it without the link', async () => {
      const res = await admin.send('post', `/admin/businesses/${sellerBusinessId}/reset-link`);
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(['expiresAt', 'url']);
      const token = decodeURIComponent(new URL(res.body.data.url).searchParams.get('token')!);

      const reset = await new Client(app).send('post', '/auth/password/reset', { token, password: 'from-admin-link' });
      expect(reset.status).toBe(200);
      expect(
        (await new Client(app).send('post', '/auth/login', { identifier: 'seller@example.com', password: 'from-admin-link' })).status,
      ).toBe(200);

      const detail = (await admin.get(`/admin/businesses/${sellerBusinessId}`)).body.data;
      expect(detail.actions[0].action).toBe('reset_link');
      expect(JSON.stringify(detail.actions)).not.toContain(token);
    });
  });

  it('removing the admin flag closes the panel at once', async () => {
    const other = await registerSeller(app, 'temp-staff@example.com', 'Temp Staff');
    await app.get(AdminService).grant('temp-staff@example.com', true);
    expect((await other.get('/admin/businesses')).status).toBe(200);
    await app.get(AdminService).grant('temp-staff@example.com', false);
    expect((await other.get('/admin/businesses')).status).toBe(404);
    expect(await app.get(AdminService).grant('nobody@example.com', true)).toBeNull();
  });

  it('the database refuses an unknown admin action', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO admin_actions (id, action) VALUES (gen_random_uuid(), 'delete_everything')`,
    ).rejects.toThrow();
  });
});
