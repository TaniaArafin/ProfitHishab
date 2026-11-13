import type { AdminPaymentDto, PaymentDto } from '@ph/shared';
import type { AdminPaymentRow, PaymentRow } from './billing.repository';

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Never carries businessId, submittedById or reviewedById: the seller sees only their own payments. */
export function toPaymentDto(p: PaymentRow): PaymentDto {
  return {
    id: p.id,
    method: p.method,
    senderNumber: p.senderNumber,
    transactionId: p.transactionId,
    months: p.months,
    amount: p.amount,
    status: p.status,
    rejectReason: p.rejectReason,
    createdAt: p.createdAt.toISOString(),
    reviewedAt: iso(p.reviewedAt),
    periodTo: iso(p.periodTo),
  };
}

export function toAdminPaymentDto(p: AdminPaymentRow): AdminPaymentDto {
  return {
    ...toPaymentDto(p),
    business: { id: p.businessId, name: p.businessName },
    submittedBy: p.submittedByName,
    reviewedBy: p.reviewedByName,
  };
}
