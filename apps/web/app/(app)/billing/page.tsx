import type { Metadata } from 'next';
import { CreditCard } from 'lucide-react';
import {
  ACCESS_STATUS_LABELS,
  BILLING_METHOD_LABELS,
  BILLING_PAYMENT_STATUS_LABELS,
  formatTaka,
  type BillingDto,
  type BillingPaymentStatus,
  type PaymentDto,
} from '@ph/shared';
import { PageHeader, TableCard } from '@/components/ui';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/server-api';
import { PaymentForm } from './PaymentForm';
import { formatDate, formatDateTime } from '../admin/format';

export const metadata: Metadata = { title: 'Billing' };

const STATUS_VARIANT: Record<BillingPaymentStatus, 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  confirmed: 'success',
  rejected: 'destructive',
};

function days(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function statusLine(b: BillingDto): string {
  if (b.status === 'unlimited') return 'No time limit';
  if (b.status === 'blocked') return ACCESS_STATUS_LABELS.blocked;
  if (b.firstPaidAt !== null && b.status === 'trial') return `Active until ${formatDate(b.accessEndsAt)}`;
  if (b.status === 'trial') return `Free trial — ${days(b.daysLeft ?? 0)} left`;
  return b.firstPaidAt !== null ? 'Plan ended' : 'Free trial ended';
}

function PaymentStatus({ p }: { p: PaymentDto }) {
  return <Badge variant={STATUS_VARIANT[p.status]}>{BILLING_PAYMENT_STATUS_LABELS[p.status]}</Badge>;
}

export default async function BillingPage() {
  const { data: billing } = await apiGet<{ data: BillingDto }>('/billing');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={CreditCard} title="Billing" description="Your access, and how to pay to keep adding and changing orders." />

      <Card className="flex flex-col gap-1 p-4">
        <p className="break-words text-lg font-semibold">{statusLine(billing)}</p>
        <p className="text-sm text-ink-muted tabular">{formatTaka(billing.pricePerMonth)} per month</p>
      </Card>

      {billing.status === 'unlimited' ? null : billing.pending ? (
        <Alert variant="warning" role="status" className="break-words">
          {`We are checking your payment (${BILLING_METHOD_LABELS[billing.pending.method]}, ${billing.pending.transactionId}). This usually takes a few hours.`}
        </Alert>
      ) : (
        <Card className="p-4">
          <PaymentForm methods={billing.methods} pricePerMonth={billing.pricePerMonth} monthOptions={billing.monthOptions} />
        </Card>
      )}

      {billing.payments.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="payment-history">
          <h2 id="payment-history" className="text-base font-semibold">
            Payment history
          </h2>
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Months</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>TrxID</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billing.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap tabular">{formatDateTime(p.createdAt)}</TableCell>
                    <TableCell className="text-right tabular">{p.months}</TableCell>
                    <TableCell className="text-right tabular">{formatTaka(p.amount)}</TableCell>
                    <TableCell>{BILLING_METHOD_LABELS[p.method]}</TableCell>
                    <TableCell className="break-all tabular">{p.transactionId}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <PaymentStatus p={p} />
                        {p.rejectReason ? <span className="max-w-[16rem] break-words text-xs text-ink-muted">{p.rejectReason}</span> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          <ul className="flex flex-col gap-2 md:hidden">
            {billing.payments.map((p) => (
              <li key={p.id}>
                <Card className="flex min-w-0 flex-col gap-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-semibold tabular">
                      {formatTaka(p.amount)} · {p.months} month{p.months === 1 ? '' : 's'}
                    </span>
                    <PaymentStatus p={p} />
                  </div>
                  <div className="break-all text-sm text-ink-muted">
                    {BILLING_METHOD_LABELS[p.method]} · <span className="tabular">{p.transactionId}</span>
                  </div>
                  <div className="text-xs text-ink-faint">{formatDateTime(p.createdAt)}</div>
                  {p.rejectReason ? <p className="break-words text-sm text-loss">{p.rejectReason}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
