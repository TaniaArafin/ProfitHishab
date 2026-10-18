import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { normalizePhone, type LoginInput, type Me, type RegisterInput } from '@ph/shared';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthContext } from '../../common/auth';
import { AuthError } from '../../common/errors';
import { config } from '../../config';
import { BusinessService } from '../business/business.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuthRepository } from './auth.repository';
import { LoginAttempts } from './login-attempts';

const DAY_MS = 86_400_000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly business: BusinessService,
    private readonly expenses: ExpensesService,
    private readonly attempts: LoginAttempts,
  ) {}

  /** FR-AUTH-01: user, business, membership, couriers and expense categories in one transaction. */
  async register(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
    const email = input.email ?? null;
    const phone = input.phone ?? null;
    if (email && (await this.repo.emailExists(email))) throw AuthError.emailTaken();
    if (phone && (await this.repo.phoneExists(phone))) throw AuthError.phoneTaken();

    // Hash before opening the transaction: no slow work while rows are held (laravel-eloquent: tx-keep-transactions-short).
    const passwordHash = await hash(input.password);
    const userId = await this.repo.transaction(async (tx) => {
      const user = await this.repo.createUser({ name: input.name, email, phone, passwordHash }, tx);
      const { businessId } = await this.business.createForOwner(
        { userId: user.id, phone },
        { name: input.businessName, businessType: input.businessType ?? null, city: input.city ?? null },
        tx,
      );
      await this.expenses.seedDefaultCategories(businessId, tx);
      return user.id;
    });
    return this.issueSession(userId, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const phone = normalizePhone(input.identifier);
    const identifier = phone ?? input.identifier.trim().toLowerCase();

    const wait = this.attempts.retryAfterMinutes(identifier, meta.ip);
    if (wait > 0) throw AuthError.tooManyFailedLogins(wait);

    const user = await this.repo.findUserByIdentifier(phone ? { phone } : { email: identifier });
    // Same message whether the account exists or not (FR-AUTH-03).
    if (!user || !(await verify(user.passwordHash, input.password))) {
      this.attempts.recordFailure(identifier, meta.ip);
      throw AuthError.wrongCredentials();
    }
    this.attempts.recordSuccess(identifier);
    return this.issueSession(user.id, meta);
  }

  async logout(sessionId: string): Promise<void> {
    await this.repo.revokeSession(sessionId);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.repo.revokeAllSessions(userId);
  }

  async me(userId: string, businessId: string): Promise<Me> {
    const [user, business] = await Promise.all([this.repo.findUser(userId), this.business.profile(businessId)]);
    return { user, business };
  }

  /**
   * Resolves a session cookie. Slides the expiry forward at most once a day so
   * an active seller stays logged in without a write on every request.
   */
  async resolveSession(token: string, now = new Date()): Promise<AuthContext | null> {
    const session = await this.repo.findActiveSession(hashToken(token), now);
    const membership = session?.user.memberships[0];
    if (!session || !membership) return null;

    if (now.getTime() - session.lastUsedAt.getTime() > DAY_MS) {
      await this.repo.extendSession(session.id, new Date(now.getTime() + config().sessionTtlMs), now);
    }
    return { userId: session.userId, businessId: membership.business.id, sessionId: session.id, timezone: membership.business.timezone };
  }

  private async issueSession(userId: string, meta: RequestMeta): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config().sessionTtlMs);
    await this.repo.createSession({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    });
    return { token, expiresAt };
  }
}
