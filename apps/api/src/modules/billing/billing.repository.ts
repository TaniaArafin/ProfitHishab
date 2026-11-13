import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminPaymentListQuery, BillingMethod, BillingPaymentStatus } from '@ph/shared';
import { PrismaService, type Tx } from '../../common/prisma.service';

export interface PaymentRow {
  id: string;
  businessId: string;
  method: BillingMethod;
  senderNumber: string;
  transactionId: string;
  months: number;
  amount: number;
  status: BillingPaymentStatus;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  periodFrom: Date | null;
  periodTo: Date | null;
}

export interface AdminPaymentRow extends PaymentRow {
  businessName: string;
  submittedByName: string | null;
  reviewedByName: string | null;
}

export interface NewPayment {
  method: BillingMethod;
  senderNumber: string;
  transactionId: string;
  months: number;
  amount: number;
}

const PAYMENT_SELECT = {
  id: true,
  businessId: true,
  method: true,
  senderNumber: true,
  transactionId: true,
  months: true,
  amount: true,
  status: true,
  rejectReason: true,
  createdAt: true,
  reviewedAt: true,
  periodFrom: true,
  periodTo: true,
} as const;

const ADMIN_SELECT = Prisma.sql`
  p.id, p."businessId", p.method, p."senderNumber", p."transactionId", p.months, p.amount, p.status,
  p."rejectReason", p."createdAt", p."reviewedAt", p."periodFrom", p."periodTo",
  b.name AS "businessName", s.name AS "submittedByName", r.name AS "reviewedByName"`;
const ADMIN_FROM = Prisma.sql`
  FROM payments p
  JOIN businesses b ON b.id = p."businessId"
  LEFT JOIN users s ON s.id = p."submittedById"
  LEFT JOIN users r ON r.id = p."reviewedById"`;

/**
 * Payments: a seller's own (always scoped by businessId) and the admin's cross-business queue.
 * Deliberate exception to tenancy for the admin methods: AdminGuard is their scope.
 * TrxID uniqueness (among pending and confirmed payments) and one-pending-per-business are enforced by the database.
 */
@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, submittedById: string, data: NewPayment, db: Tx = this.prisma): Promise<PaymentRow> {
    return db.payment.create({ data: { businessId, submittedById, ...data }, select: PAYMENT_SELECT }) as Promise<PaymentRow>;
  }

  pendingFor(businessId: string, db: Tx = this.prisma): Promise<PaymentRow | null> {
    return db.payment.findFirst({ where: { businessId, status: 'pending' }, select: PAYMENT_SELECT }) as Promise<PaymentRow | null>;
  }

  /** Newest first. */
  recentFor(businessId: string, limit: number, db: Tx = this.prisma): Promise<PaymentRow[]> {
    return db.payment.findMany({
      where: { businessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: PAYMENT_SELECT,
    }) as Promise<PaymentRow[]>;
  }

  /** Locks one payment row (any business: admin only) and returns it, or null when it does not exist. */
  async lockForUpdate(paymentId: string, db: Tx): Promise<PaymentRow | null> {
    const rows = await db.$queryRaw<PaymentRow[]>`
      SELECT id, "businessId", method, "senderNumber", "transactionId", months, amount, status,
        "rejectReason", "createdAt", "reviewedAt", "periodFrom", "periodTo"
      FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async markConfirmed(
    id: string,
    data: { reviewedById: string; at: Date; periodFrom: Date | null; periodTo: Date | null },
    db: Tx,
  ): Promise<void> {
    await db.payment.update({
      where: { id },
      data: {
        status: 'confirmed',
        reviewedById: data.reviewedById,
        reviewedAt: data.at,
        periodFrom: data.periodFrom,
        periodTo: data.periodTo,
      },
      select: { id: true },
    });
  }

  async markRejected(id: string, data: { reviewedById: string; at: Date; reason: string }, db: Tx): Promise<void> {
    await db.payment.update({
      where: { id },
      data: { status: 'rejected', reviewedById: data.reviewedById, reviewedAt: data.at, rejectReason: data.reason },
      select: { id: true },
    });
  }

  /** Cross-business. The pending queue is oldest first (the longest-waiting seller is served first); history is newest first. */
  async paginateForAdmin(f: AdminPaymentListQuery) {
    // Fixed fragments, never user input: the direction is picked from the validated status.
    const order = f.status === 'pending' ? Prisma.sql`p."createdAt" ASC, p.id ASC` : Prisma.sql`p."createdAt" DESC, p.id DESC`;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<AdminPaymentRow[]>`
        SELECT ${ADMIN_SELECT} ${ADMIN_FROM}
        WHERE p.status = ${f.status}
        ORDER BY ${order}
        LIMIT ${f.perPage} OFFSET ${(f.page - 1) * f.perPage}`,
      this.prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total FROM payments p WHERE p.status = ${f.status}`,
    ]);
    return { rows, total: count[0].total };
  }

  async findForAdmin(id: string): Promise<AdminPaymentRow | null> {
    const rows = await this.prisma.$queryRaw<AdminPaymentRow[]>`
      SELECT ${ADMIN_SELECT} ${ADMIN_FROM} WHERE p.id = ${id}::uuid`;
    return rows[0] ?? null;
  }

  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
