import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/common/prisma.service';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { LoginAttempts } from '../src/modules/auth/login-attempts';
import { Mailer, type Mail } from '../src/modules/auth/mailer';
import { Client, createTestApp, registerSeller } from './helpers';

describe('Forgot password by email (FR-AUTH-06) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sent: Mail[];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    jest.spyOn(app.get(Mailer), 'send').mockImplementation((mail: Mail) => {
      sent.push(mail);
      return Promise.resolve();
    });
  });

  beforeEach(() => {
    sent = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const forgot = (email: string) => new Client(app).send('post', '/auth/password/forgot', { email });
  const reset = (token: string, password: string) => new Client(app).send('post', '/auth/password/reset', { token, password });
  /** The token from the last emailed link. */
  const lastToken = () => decodeURIComponent(/token=([^\s"&]+)/.exec(sent.at(-1)!.text)![1]);
  const login = (identifier: string, password: string) => new Client(app).send('post', '/auth/login', { identifier, password });

  it('answers the same for a known and an unknown email, and emails only the known one', async () => {
    await registerSeller(app, 'known@example.com');
    const known = await forgot('Known@Example.com');
    const unknown = await forgot('nobody@example.com');

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ data: { ok: true } });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('known@example.com');
    expect(sent[0].text).toContain('http://localhost:3000/reset-password?token=');
  });

  it('stores only a hash of the token', async () => {
    await registerSeller(app, 'hash@example.com');
    await forgot('hash@example.com');
    const token = lastToken();
    const row = await prisma.passwordReset.findFirstOrThrow({ where: { user: { email: 'hash@example.com' } } });
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('sets the new password once, logs out every device, and refuses the link a second time', async () => {
    const seller = await registerSeller(app, 'reset@example.com');
    expect((await seller.get('/auth/me')).status).toBe(200);
    await forgot('reset@example.com');
    const token = lastToken();

    const res = await reset(token, 'brand-new-pass');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });

    expect((await seller.get('/auth/me')).status).toBe(401);
    expect((await login('reset@example.com', 'secret-pass-1')).status).toBe(401);
    expect((await login('reset@example.com', 'brand-new-pass')).status).toBe(200);

    const again = await reset(token, 'another-pass-2');
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('reset_link_invalid');
  });

  it('refuses an expired link, a made-up link and a short password', async () => {
    await registerSeller(app, 'expired@example.com');
    await forgot('expired@example.com');
    const token = lastToken();

    expect((await reset(token, 'short')).status).toBe(422);
    expect((await reset('x'.repeat(43), 'brand-new-pass')).body.error.code).toBe('reset_link_invalid');

    await prisma.passwordReset.updateMany({
      where: { user: { email: 'expired@example.com' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await reset(token, 'brand-new-pass')).body.error.code).toBe('reset_link_invalid');
    expect((await login('expired@example.com', 'secret-pass-1')).status).toBe(200);
  });

  it('only the newest link works', async () => {
    await registerSeller(app, 'newest@example.com');
    await forgot('newest@example.com');
    const older = lastToken();
    await forgot('newest@example.com');
    const newer = lastToken();

    expect((await reset(older, 'brand-new-pass')).status).toBe(422);
    expect((await reset(newer, 'brand-new-pass')).status).toBe(200);
  });

  it('sends at most 3 links an hour, without telling the caller', async () => {
    await registerSeller(app, 'limit@example.com');
    for (let i = 0; i < 4; i++) expect((await forgot('limit@example.com')).status).toBe(202);
    expect(sent).toHaveLength(3);
  });

  it('lifts the account lock-out after a successful reset', async () => {
    await registerSeller(app, 'locked-out@example.com');
    // Lock the account only. Real failed logins would also lock this test's IP (every request is
    // 127.0.0.1); the IP lock is deliberate and a reset does not lift it.
    const attempts = app.get(LoginAttempts);
    for (let i = 0; i < 5; i++) attempts.recordFailure('locked-out@example.com', undefined);
    expect((await login('locked-out@example.com', 'secret-pass-1')).status).toBe(429);

    await forgot('locked-out@example.com');
    expect((await reset(lastToken(), 'brand-new-pass')).status).toBe(200);
    expect((await login('locked-out@example.com', 'brand-new-pass')).status).toBe(200);
  });

  it('changes nothing when the reset fails partway, and the link still works afterwards', async () => {
    const seller = await registerSeller(app, 'rollback@example.com');
    await forgot('rollback@example.com');
    const token = lastToken();
    const spy = jest.spyOn(app.get(AuthRepository), 'revokeAllSessions').mockRejectedValueOnce(new Error('boom'));

    expect((await reset(token, 'brand-new-pass')).status).toBe(500);
    expect((await login('rollback@example.com', 'secret-pass-1')).status).toBe(200);
    expect((await seller.get('/auth/me')).status).toBe(200);

    expect((await reset(token, 'brand-new-pass')).status).toBe(200);
    spy.mockRestore();
  });

  it('works for a seller whose trial has ended (the routes are public)', async () => {
    const seller = await registerSeller(app, 'trial-over@example.com');
    const me = await seller.get('/auth/me');
    await prisma.business.update({ where: { id: me.body.data.business.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await forgot('trial-over@example.com');
    expect((await reset(lastToken(), 'brand-new-pass')).status).toBe(200);
  });
});
