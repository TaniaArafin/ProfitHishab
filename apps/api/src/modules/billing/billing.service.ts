import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  accessStatus,
  BILLING_METHOD_LABELS,
  BILLING_METHODS,
  BILLING_MONTH_OPTIONS,
  BILLING_PERIOD_DAYS,
  DEFAULT_TIMEZONE,
  formatTaka,
  newAccessEnd,
  trialDaysLeft,
  type AdminPaymentDto,
  type BillingDto,
  type PaymentDto,
  type PaymentSubmitInput,
} from '@ph/shared';
import type { AuthContext } from '../../common/auth';
import type { Tx } from '../../common/prisma.service';
import { config } from '../../config';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { Mailer } from '../auth/mailer';
import { BusinessService } from '../business/business.service';
import { BillingError } from './billing.errors';
import { toAdminPaymentDto, toPaymentDto } from './billing.presenter';
import { BillingRepository, type PaymentRow } from './billing.repository';

const RECENT_PAYMENTS = 20;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const dhakaDate = new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Manual bKash/Nagad payments. The seller reports a payment; a platform admin checks it against the
 * statement and confirms (access is extended) or rejects it. Confirm and reject lock the payment row
 * first, then the business, and write their admin_actions row in the same transaction.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly repo: BillingRepository,
    private readonly business: BusinessService,
    private readonly admin: AdminService,
    private readonly auth: AuthService,
    private readonly mailer: Mailer,
  ) {}

  /** The seller's billing page: access status, price, where to send money, and their own payments. */
  async overview(auth: AuthContext, now = new Date()): Promise<BillingDto> {
    const { pricePerMonth, numbers } = config().billing;
    const [payments, profile] = await Promise.all([
      this.repo.recentFor(auth.businessId, RECENT_PAYMENTS),
      this.business.profile(auth.businessId),
    ]);
    // A pending payment is always the newest: no other can be sent while it waits.
    const pending = payments.find((p) => p.status === 'pending');
    return {
      status: accessStatus(auth.trialEndsAt, auth.blockedAt, now),
      accessEndsAt: iso(auth.trialEndsAt),
      daysLeft: trialDaysLeft(auth.trialEndsAt, now),
      pricePerMonth,
      methods: BILLING_METHODS.flatMap((method) => (numbers[method] ? [{ method, number: numbers[method] }] : [])),
      monthOptions: [...BILLING_MONTH_OPTIONS],
      pending: pending ? toPaymentDto(pending) : null,
      payments: payments.map(toPaymentDto),
      firstPaidAt: profile.firstPaidAt,
    };
  }

  /** Allowed after the trial ends (the controller is @AllowAfterTrial), so a read-only seller can pay. */
  async submit(auth: AuthContext, input: PaymentSubmitInput): Promise<PaymentDto> {
    const { pricePerMonth, numbers } = config().billing;
    if (!numbers[input.method]) throw BillingError.methodUnavailable();
    const data = { ...input, amount: pricePerMonth * input.months };
    try {
      const row = await this.repo.transaction(async (tx) => {
        if (await this.repo.pendingFor(auth.businessId, tx)) throw BillingError.paymentPending();
        return this.repo.create(auth.businessId, auth.userId, data, tx);
      });
      return toPaymentDto(row);
    } catch (error) {
      // The database is the final judge: a TrxID pending or confirmed for any business, or a pending payment that raced in.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw isTransactionIdConflict(error) ? BillingError.transactionUsed() : BillingError.paymentPending();
      }
      throw error;
    }
  }

  /**
   * Extends access by `months × 30` days from the later of now and the current end; an unlimited
   * business stays unlimited. Repeat-safe: a second confirm finds the payment no longer pending.
   * The receipt is emailed after the commit and never fails the confirmation.
   */
  async confirm(adminUserId: string, paymentId: string, now = new Date()): Promise<AdminPaymentDto> {
    const receipt = await this.repo.transaction(async (tx) => {
      const payment = await this.lockPending(paymentId, tx);
      const current = await this.business.lockAccess(payment.businessId, tx);
      if (!current) throw BillingError.notFound();
      const currentEnd = current.trialEndsAt;
      const next =
        currentEnd === null ? null : newAccessEnd({ mode: 'extend', days: payment.months * BILLING_PERIOD_DAYS }, currentEnd, now);
      const periodFrom = next === null ? null : new Date(Math.max(now.getTime(), currentEnd?.getTime() ?? now.getTime()));

      await this.business.setAccessEnd(payment.businessId, next, tx);
      await this.business.markPaid(payment.businessId, now, tx);
      await this.repo.markConfirmed(payment.id, { reviewedById: adminUserId, at: now, periodFrom, periodTo: next }, tx);
      await this.admin.recordAction(
        {
          adminUserId,
          businessId: payment.businessId,
          action: 'confirm_payment',
          details: { paymentId: payment.id, amount: payment.amount, months: payment.months, from: iso(currentEnd), to: iso(next) },
        },
        tx,
      );
      const to = await this.auth.ownerEmail(payment.businessId, tx);
      return to ? { to, payment, accessEndsAt: next } : null;
    });
    if (receipt) this.sendReceipt(receipt.to, receipt.payment, receipt.accessEndsAt);
    return this.showForAdmin(paymentId);
  }

  /** No access change; the seller sees the reason and may send a corrected payment. */
  async reject(adminUserId: string, paymentId: string, reason: string, now = new Date()): Promise<AdminPaymentDto> {
    await this.repo.transaction(async (tx) => {
      const payment = await this.lockPending(paymentId, tx);
      await this.repo.markRejected(payment.id, { reviewedById: adminUserId, at: now, reason }, tx);
      await this.admin.recordAction(
        { adminUserId, businessId: payment.businessId, action: 'reject_payment', details: { paymentId: payment.id, reason } },
        tx,
      );
    });
    return this.showForAdmin(paymentId);
  }

  /** The payment row is locked first (then the business), so concurrent reviews queue up behind it. */
  private async lockPending(paymentId: string, tx: Tx): Promise<PaymentRow> {
    const payment = await this.repo.lockForUpdate(paymentId, tx);
    if (!payment) throw BillingError.notFound();
    if (payment.status !== 'pending') throw BillingError.alreadyReviewed();
    return payment;
  }

  private async showForAdmin(paymentId: string): Promise<AdminPaymentDto> {
    const row = await this.repo.findForAdmin(paymentId);
    if (!row) throw BillingError.notFound();
    return toAdminPaymentDto(row);
  }

  private sendReceipt(to: string, payment: PaymentRow, accessEndsAt: Date | null): void {
    this.mailer.send(receiptEmail(to, payment, accessEndsAt)).catch((error: unknown) => {
      this.logger.error({ err: error, paymentId: payment.id }, 'Payment receipt email failed');
    });
  }
}

/**
 * Prisma names the failed key's columns in meta.target, also for the partial unique indexes:
 * ["method","transactionId"] (payments_method_transactionId_active_key) or ["businessId"] (payments_one_pending_per_business).
 */
function isTransactionIdConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes('transactionId');
  return typeof target === 'string' && target.includes('transactionId');
}

function receiptEmail(to: string, payment: PaymentRow, accessEndsAt: Date | null) {
  const subject = 'ProfitHishab payment confirmed';
  const months = `${payment.months} month${payment.months === 1 ? '' : 's'}`;
  const until = accessEndsAt ? `Your account is paid until ${dhakaDate.format(accessEndsAt)}.` : 'Your account has no end date.';
  const paid = `We received ${formatTaka(payment.amount)} for ${months} (${BILLING_METHOD_LABELS[payment.method]} transaction ${payment.transactionId}).`;
  const text = ['Hi,', '', paid, until, '', 'Thank you for using ProfitHishab.', '', 'ProfitHishab'].join('\n');
  const html = `<p>Hi,</p>
<p>${paid}</p>
<p>${until}</p>
<p>Thank you for using ProfitHishab.</p>
<p>ProfitHishab</p>`;
  return { to, subject, text, html };
}
