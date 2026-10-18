import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureApp } from '../src/app.factory';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

export const tk = (taka: number) => taka * 100;
export const CSRF = 'test-csrf-token';

/** Minimal cookie-carrying client: session cookie from login plus the CSRF double-submit pair. */
export class Client {
  private session = '';
  constructor(private readonly app: INestApplication) {}

  private cookie() {
    return `ph_csrf=${CSRF}${this.session ? `; ph_session=${this.session}` : ''}`;
  }

  private capture(res: request.Response) {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const found = raw?.map((c) => /^ph_session=([^;]*)/.exec(c)?.[1]).find((v) => v !== undefined);
    if (found !== undefined) this.session = found;
    return res;
  }

  get(path: string) {
    return request(this.app.getHttpServer()).get(`/v1${path}`).set('Cookie', this.cookie());
  }

  /**
   * POST /orders needs an Idempotency-Key; a fresh one is generated per call unless
   * `opts.idempotencyKey` is given (null sends none).
   */
  async send(
    method: 'post' | 'patch' | 'delete',
    path: string,
    body?: object,
    opts: { csrf?: boolean; idempotencyKey?: string | null } = {},
  ) {
    let req = request(this.app.getHttpServer())[method](`/v1${path}`).set('Cookie', this.cookie());
    if (opts.csrf !== false) req = req.set('x-csrf-token', CSRF);
    const key = opts.idempotencyKey === undefined && method === 'post' && path === '/orders' ? randomUUID() : opts.idempotencyKey;
    if (key) req = req.set('Idempotency-Key', key);
    return this.capture(await req.send(body));
  }
}

/** Boots the real app (same pipeline as main.ts) on an empty test database. */
export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, bufferLogs: true }));
  await app.init();
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, businesses, sessions, business_members, categories, products, product_prices, customers, couriers, orders, order_items, order_status_history, expense_categories, expenses, imports, import_rows CASCADE',
  );
  return { app, prisma };
}

export async function registerSeller(app: INestApplication, email: string, businessName = 'Test Shop'): Promise<Client> {
  const client = new Client(app);
  const res = await client.send('post', '/auth/register', { name: 'Nusrat', businessName, email, password: 'secret-pass-1' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return client;
}
