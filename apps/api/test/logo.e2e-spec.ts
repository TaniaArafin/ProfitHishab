import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import sharp from 'sharp';
import { Client, createTestApp, registerSeller } from './helpers';

const png = (width = 600, height = 300) =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 60 } } })
    .png()
    .toBuffer();

/** FR-BIZ-01: the business logo. */
describe('Business logo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seller: Client;
  let other: Client;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    seller = await registerSeller(app, 'logo@logo.test', 'Logo Shop');
    other = await registerSeller(app, 'other@logo.test', 'Other Shop');
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 without a session on every route', async () => {
    const anon = new Client(app);
    expect((await anon.upload('/business/logo', 'file', await png(), 'logo.png')).status).toBe(401);
    expect((await anon.get('/business/logo')).status).toBe(401);
    expect((await anon.send('delete', '/business/logo')).status).toBe(401);
  });

  it('uploads a PNG, stores it as a 256 px WebP and serves it to its own business only', async () => {
    const res = await seller.upload('/business/logo', 'file', await png(), 'logo.png');
    expect(res.status).toBe(201);
    expect(res.body.data.logoUrl).toMatch(/^\/api\/business\/logo\?v=\d+$/);
    expect((await seller.get('/business')).body.data.logoUrl).toBe(res.body.data.logoUrl);

    const img = await seller.get('/business/logo').buffer(true);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['cache-control']).toBe('private, max-age=86400');
    expect(await sharp(img.body as Buffer).metadata()).toMatchObject({ format: 'webp', width: 256, height: 128 });

    const others = await other.get('/business/logo');
    expect(others.status).toBe(404);
    expect(others.body.error.code).toBe('logo_not_found');
  });

  it('413 for a file over 2 MB and 415 for a file that is not an image', async () => {
    const big = await seller.upload('/business/logo', 'file', Buffer.alloc(2 * 1024 * 1024 + 1, 1), 'big.png');
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('logo_too_large');
    const text = await seller.upload('/business/logo', 'file', Buffer.from('not an image'), 'logo.png');
    expect(text.status).toBe(415);
    expect(text.body.error.code).toBe('logo_unsupported');
  });

  it('removes the logo', async () => {
    const res = await seller.send('delete', '/business/logo');
    expect(res.status).toBe(200);
    expect(res.body.data.logoUrl).toBeNull();
    expect((await seller.get('/business/logo')).status).toBe(404);
  });

  it('is a normal write: refused after the trial ends', async () => {
    const businessId = (await other.get('/auth/me')).body.data.business.id as string;
    await prisma.business.update({ where: { id: businessId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const res = await other.upload('/business/logo', 'file', await png(), 'logo.png');
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('trial_ended');
  });
});
