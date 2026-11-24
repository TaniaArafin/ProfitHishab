import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash, verify } from '@node-rs/argon2';
import {
  normalizePhone,
  type AccountUpdateInput,
  type ChangePasswordInput,
  trialEndsAt,
  type LoginInput,
  type Me,
  type OtpSentDto,
  type RegisterInput,
  type SignupOptionsDto,
  TRIAL_DAYS,
} from '@ph/shared';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthContext } from '../../common/auth';
import type { Tx } from '../../common/prisma.service';
import { AuthError } from '../../common/errors';
import { config } from '../../config';
import { BusinessService } from '../business/business.service';
import { ExpensesService } from '../expenses/expenses.service';
import { AuthRepository } from './auth.repository';
import { LoginAttempts } from './login-attempts';
import { hashOtp, newOtpCode, OTP, otpSendWait } from './otp';
import { PhoneVerificationRepository } from './phone-verification.repository';
import { emailRequiredAtSignup, SmsSender } from './sms.sender';

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

/** A Prisma unique-constraint error on a constraint that includes `field` (`meta.target`). */
function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === 'string' && target.includes(field);
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

  signupOptions(): SignupOptionsDto {
    return { otpRequired: config().sms.otpRequired, emailRequired: emailRequiredAtSignup(), trialDays: TRIAL_DAYS };
  }

  /** Registration step 1 (OTP_REQUIRED on): text a one-time code to a phone that is not registered yet. */
  async requestOtp(phone: string, now = new Date()): Promise<OtpSentDto> {
    if (!config().sms.otpRequired) throw AuthError.otpNotEnabled();
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
   * FR-AUTH-01. Every new business gets the free trial. With OTP_REQUIRED on, the phone's SMS code is
   * checked first and the number is remembered so it never gets a second trial; with it off (test
   * phase) an email or phone and a password are enough, and nothing is remembered because nothing
   * was verified. Then user, business, membership, couriers and expense categories are created in
   * one transaction.
   */
  async register(input: RegisterInput, meta: RequestMeta, now = new Date()): Promise<IssuedSession> {
    const email = input.email ?? null;
    const phone = input.phone ?? null;
    if (!email && emailRequiredAtSignup()) throw AuthError.emailRequired();
    const verify = config().sms.otpRequired;
    if (verify && !phone) throw AuthError.phoneRequired();
    if (email && (await this.repo.emailExists(email))) throw AuthError.emailTaken();
    if (phone && (await this.repo.phoneExists(phone))) throw AuthError.phoneTaken();

    let otpId: string | null = null;
    if (verify && phone) {
      if (!input.code) throw AuthError.codeRequired();
      const otp = await this.phones.liveOtp(phone, now, OTP.maxAttempts);
      if (!otp) throw AuthError.codeExpired();
      if (!sameHash(otp.codeHash, hashOtp(phone, input.code))) {
        // Counted outside the transaction below, so a wrong guess is never rolled back.
        const used = await this.phones.recordWrongAttempt(otp.id);
        throw AuthError.codeWrong(Math.max(0, OTP.maxAttempts - used));
      }
      otpId = otp.id;
    }

    // Hash before opening the transaction: no slow work while rows are held (laravel-eloquent: tx-keep-transactions-short).
    const passwordHash = await hash(input.password);
    const userId = await this.repo.transaction(async (tx) => {
      if (otpId && !(await this.phones.consumeOtp(otpId, now, tx))) throw AuthError.codeExpired();
      const verifiedPhone = otpId ? phone : null;
      const user = await this.repo.createUser(
        { name: input.name, email, phone, phoneVerifiedAt: verifiedPhone ? now : null, passwordHash },
        tx,
      );
      // A number that already had a trial (verified earlier) gets none, in either mode.
      const trialUsed = phone ? await this.phones.trialUsed(phone, tx) : false;
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
      // Only a verified number is remembered: an unverified one could belong to someone else.
      if (verifiedPhone) await this.phones.claimTrial(verifiedPhone, businessId, tx);
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
    if (await this.repo.isBlocked(user.id)) throw AuthError.accountBlocked();
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
   * FR-AUTH-09: edit name, email and phone. Another user's email or phone is 409; an email cannot be
   * removed while it is the only way to reset a password (no SMS gateway), and one of the two must stay.
   * A new phone was not confirmed by SMS, so it is stored unverified.
   */
  async updateAccount(userId: string, input: AccountUpdateInput): Promise<Me['user']> {
    const current = await this.repo.findUser(userId);
    const email = input.email === undefined ? current.email : input.email;
    const phone = input.phone === undefined ? current.phone : input.phone;
    // Removing an email is refused; an older phone-only account (from before email was required) may stay so.
    if (!email && current.email && emailRequiredAtSignup()) throw AuthError.emailRequired();
    if (!email && !phone) throw AuthError.contactRequired();
    if (email && email !== current.email && (await this.repo.emailExists(email, userId))) throw AuthError.emailTaken();
    if (phone && phone !== current.phone && (await this.repo.phoneExists(phone, userId))) throw AuthError.phoneTaken();

    const phoneChanged = input.phone !== undefined && input.phone !== current.phone;
    try {
      return await this.repo.updateUser(userId, {
        name: input.name,
        email: input.email,
        phone: input.phone,
        ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
      });
    } catch (error) {
      // Two accounts claiming the same email or phone at once: the unique index decides.
      if (isUniqueViolationOn(error, 'email')) throw AuthError.emailTaken();
      if (isUniqueViolationOn(error, 'phone')) throw AuthError.phoneTaken();
      throw error;
    }
  }

  /** FR-AUTH-09: checks the current password, sets the new one and logs out every other device. */
  async changePassword(auth: { userId: string; sessionId: string }, input: ChangePasswordInput): Promise<void> {
    if (!(await verify(await this.repo.findPasswordHash(auth.userId), input.currentPassword))) throw AuthError.wrongCurrentPassword();
    // Hash before opening the transaction (laravel-eloquent: tx-keep-transactions-short).
    const passwordHash = await hash(input.newPassword);
    await this.repo.transaction(async (tx) => {
      await this.repo.updatePassword(auth.userId, passwordHash, tx);
      await this.repo.revokeOtherSessions(auth.userId, auth.sessionId, tx);
    });
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
      blockedAt: business.blockedAt,
      isPlatformAdmin: session.user.isPlatformAdmin,
    };
  }

  /** Platform admin: logs out everyone in a blocked business, inside the admin's transaction. */
  async revokeBusinessSessions(businessId: string, db: Tx): Promise<void> {
    await this.repo.revokeBusinessSessions(businessId, db);
  }

  /** Billing receipts: where to email the business owner; null when they have no email. */
  ownerEmail(businessId: string, db?: Tx): Promise<string | null> {
    return this.repo.ownerEmail(businessId, db);
  }

  /**
   * `npm run admin:grant`: makes the user with this email or phone a platform admin (or removes it).
   * Returns their user id, or null when no user has that identifier.
   */
  async setPlatformAdmin(identifier: string, on: boolean): Promise<{ id: string; name: string } | null> {
    const phone = normalizePhone(identifier);
    return this.repo.setPlatformAdmin(phone ? { phone } : { email: identifier.trim().toLowerCase() }, on);
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
