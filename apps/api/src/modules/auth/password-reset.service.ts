import { Injectable, Logger } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { ForgotPasswordInput, ResetPasswordInput } from '@ph/shared';
import { randomBytes } from 'node:crypto';
import { AuthError } from '../../common/errors';
import { config } from '../../config';
import { AuthRepository } from './auth.repository';
import { hashToken } from './auth.service';
import { LoginAttempts } from './login-attempts';
import { Mailer } from './mailer';
import { PasswordResetRepository } from './password-reset.repository';

/** FR-AUTH-06 / FR-AUTH-08. */
export const RESET = { ttlMinutes: 60, maxPerHour: 3 } as const;

/** Forgot password by email: a single-use link, valid 60 minutes; using it logs the user out everywhere. */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly users: AuthRepository,
    private readonly resets: PasswordResetRepository,
    private readonly mailer: Mailer,
    private readonly attempts: LoginAttempts,
  ) {}

  /**
   * Emails a reset link when an account uses this email. The caller always gets the same answer,
   * so the form never reveals whether an account exists (FR-AUTH-03). Past the hourly limit the
   * request is quietly ignored, for the same reason.
   */
  async requestLink(input: ForgotPasswordInput, now = new Date()): Promise<void> {
    const user = await this.users.findUserByIdentifier({ email: input.email });
    if (!user?.email) return;
    if ((await this.resets.countSince(user.id, new Date(now.getTime() - 3_600_000))) >= RESET.maxPerHour) return;

    const token = randomBytes(32).toString('base64url');
    const link = await this.resets.create({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET.ttlMinutes * 60_000),
    });
    // Only the newest link works.
    await this.resets.closeOthers(user.id, link.id, now);

    const url = `${config().webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    // Not awaited: an account that exists must not answer slower than one that doesn't.
    void this.mailer.send(resetEmail(user.email, user.name, url)).catch((err: unknown) => {
      this.logger.error({ err, userId: user.id }, 'Password reset email failed');
    });
  }

  /** Sets the new password, closes every link of the user and revokes all their sessions, in one transaction. */
  async reset(input: ResetPasswordInput, now = new Date()): Promise<void> {
    const link = await this.resets.findLive(hashToken(input.token), now);
    if (!link) throw AuthError.resetLinkInvalid();

    // Hash before opening the transaction (laravel-eloquent: tx-keep-transactions-short).
    const passwordHash = await hash(input.password);
    await this.users.transaction(async (tx) => {
      if (!(await this.resets.markUsed(link.id, now, tx))) throw AuthError.resetLinkInvalid();
      await this.resets.closeOthers(link.userId, null, now, tx);
      await this.users.updatePassword(link.userId, passwordHash, tx);
      await this.users.revokeAllSessions(link.userId, tx);
    });

    // Proving ownership of the email lifts a login lock-out from earlier wrong passwords.
    if (link.user.email) this.attempts.recordSuccess(link.user.email);
    if (link.user.phone) this.attempts.recordSuccess(link.user.phone);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function resetEmail(to: string, name: string, url: string) {
  const subject = 'Reset your ProfitHishab password';
  const text = [
    `Hi ${name},`,
    '',
    'Someone asked to reset the password for your ProfitHishab account.',
    `Open this link to choose a new password. It works once, for ${RESET.ttlMinutes} minutes:`,
    url,
    '',
    "If you didn't ask for this, ignore this email. Your password stays the same.",
    '',
    'ProfitHishab',
  ].join('\n');
  const html = `<p>Hi ${escapeHtml(name)},</p>
<p>Someone asked to reset the password for your ProfitHishab account.</p>
<p><a href="${escapeHtml(url)}">Choose a new password</a>. The link works once, for ${RESET.ttlMinutes} minutes.</p>
<p>If you didn't ask for this, ignore this email. Your password stays the same.</p>
<p>ProfitHishab</p>`;
  return { to, subject, text, html };
}
