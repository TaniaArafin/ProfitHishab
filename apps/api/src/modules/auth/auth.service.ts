import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { normalizePhone, trialEndsAt, type LoginInput, type Me, type OtpSentDto, type RegisterInput } from '@ph/shared';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthContext } from '../../common/auth';
import { AuthError } from '../../common/errors';
import { config } from '../../config';
import { BusinessService } from '../business/business.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuthRepository } from './auth.repository';
import { LoginAttempts } from './login-attempts';
import { hashOtp, newOtpCode, OTP, otpSendWait } from './otp';
import { PhoneVerificationRepository } from './phone-verification.repository';
import { SmsSender } from './sms.sender';

const DAY_MS = 86_400_000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Constant-time comparison of two hex digests. */
function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
    private readonly phones: PhoneVerificationRepository,
    private readonly sms: SmsSender,
  ) {}

  /** Registration step 1: text a one-time code to a phone that is not registered yet. */
  async requestOtp(phone: string, now = new Date()): Promise<OtpSentDto> {
    if (await this.repo.phoneExists(phone)) throw AuthError.phoneTaken();

    const wait = otpSendWait(await this.phones.sentSince(phone, new Date(now.getTime() - 3_600_000)), now);
    if (wait?.reason === 'resend') throw AuthError.resendTooSoon(wait.seconds);
    if (wait) throw AuthError.tooManyCodes(Math.ceil(wait.seconds / 60));

    const code = newOtpCode(config().sms.fixedCode);
    await this.phones.createOtp({ phone, codeHash: hashOtp(phone, code), expiresAt: new Date(now.getTime() + OTP.ttlSeconds * 1000) });
    await this.sms.send(phone, `Your ProfitHishab code is ${code}. It works for 10 minutes. Never share it.`);
    return { expiresIn: OTP.ttlSeconds, resendIn: OTP.resendSeconds };
  }

  /**
   * FR-AUTH-01, step 2: the phone's code is checked, then user, business (with its trial), membership,
   * couriers and expense categories are created in one transaction. One trial per phone number, ever.
   */
  async register(input: RegisterInput, meta: RequestMeta, now = new Date()): Promise<IssuedSession> {
    const email = input.email ?? null;
    const { phone } = input;
    if (email && (await this.repo.emailExists(email))) throw AuthError.emailTaken();
    if (await this.repo.phoneExists(phone)) throw AuthError.phoneTaken();

    const otp = await this.phones.liveOtp(phone, now, OTP.maxAttempts);
    if (!otp) throw AuthError.codeExpired();
    if (!sameHash(otp.codeHash, hashOtp(phone, input.code))) {
      // Counted outside the transaction below, so a wrong guess is never rolled back.
      const used = await this.phones.recordWrongAttempt(otp.id);
      throw AuthError.codeWrong(Math.max(0, OTP.maxAttempts - used));
    }

    // Hash before opening the transaction: no slow work while rows are held (laravel-eloquent: tx-keep-transactions-short).
    const passwordHash = await hash(input.password);
    const userId = await this.repo.transaction(async (tx) => {
      if (!(await this.phones.consumeOtp(otp.id, now, tx))) throw AuthError.codeExpired();
      const user = await this.repo.createUser({ name: input.name, email, phone, phoneVerifiedAt: now, passwordHash }, tx);
      const trialUsed = await this.phones.trialUsed(phone, tx);
      const { businessId } = await this.business.createForOwner(
        { userId: user.id, phone },
        {
          name: input.businessName,
          businessType: input.businessType ?? null,
          city: input.city ?? null,
          trialEndsAt: trialEndsAt(now, trialUsed),
        },
        tx,
      );
      await this.phones.claimTrial(phone, businessId, tx);
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
    const { business } = membership;
    return {
      userId: session.userId,
      businessId: business.id,
      sessionId: session.id,
      timezone: business.timezone,
      trialEndsAt: business.trialEndsAt,
    };
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
