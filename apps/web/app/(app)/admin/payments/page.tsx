import type { Metadata } from 'next';
import { Banknote } from 'lucide-react';
import Link from 'next/link';
import {
  BILLING_METHOD_LABELS,
  BILLING_PAYMENT_STATUSES,
  formatTaka,
  type AdminPaymentDto,
  type BillingPaymentStatus,
  type Paginated,
} from '@ph/shared';
import { EmptyState, PageHeader, Pagination, TableCard } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { apiGet, qs } from '@/lib/server-api';
import { formatDateTime } from '../format';
import { PaymentReview } from './PaymentReview';

export const metadata: Metadata = { title: 'Payments · Admin' };

/** Admin wording; the seller-facing BILLING_PAYMENT_STATUS_LABELS ("Waiting for check") stays on /billing. */
const ADMIN_STATUS_LABELS: Record<BillingPaymentStatus, string> = { pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Platform admins only: the API answers 404 to anyone else, which shows the not-found page. */
export default async function AdminPaymentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status: BillingPaymentStatus = BILLING_PAYMENT_STATUSES.find((s) => s === sp.status) ?? 'pending';
  const list = await apiGet<Paginated<AdminPaymentDto>>(`/admin/payments?${qs({ ...sp, status }, ['status', 'page'])}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Banknote}
        title="Payments"
        description="Check each bKash or Nagad payment against your statement, then confirm or reject it."
      />
      <nav aria-label="Payment status" className="flex gap-2">
        {BILLING_PAYMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/payments?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
              s === status ? 'border-brand bg-brand text-white' : 'border-line bg-card text-ink-muted hover:border-ink/20',
            )}
          >
            {ADMIN_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {list.data.length === 0 ? (
        <EmptyState icon={Banknote} title={`No ${ADMIN_STATUS_LABELS[status].toLowerCase()} payments`} />
      ) : (
        <>
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Submitted</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>TrxID</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-ink-muted tabular">{formatDateTime(p.createdAt)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/businesses/${p.business.id}`}
                        className="block max-w-[14rem] truncate font-semibold text-ink hover:underline"
                      >
                        {p.business.name}
                      </Link>
                      <div className="max-w-[14rem] truncate text-xs text-ink-faint">{p.submittedBy ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      <div className="font-semibold">{formatTaka(p.amount)}</div>
                      <div className="text-xs text-ink-faint">
                        {p.months} month{p.months === 1 ? '' : 's'}
                      </div>
                    </TableCell>
                    <TableCell>{BILLING_METHOD_LABELS[p.method]}</TableCell>
                    <TableCell className="tabular">{p.senderNumber}</TableCell>
                    <TableCell className="tabular">{p.transactionId}</TableCell>
                    <TableCell>{p.status === 'pending' ? <PaymentReview payment={p} /> : <ReviewedNote payment={p} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          <ul className="flex flex-col gap-2 md:hidden">
            {list.data.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/admin/businesses/${p.business.id}`} className="min-w-0 break-words font-semibold hover:underline">
                      {p.business.name}
                    </Link>
                    <span className="shrink-0 font-semibold tabular">{formatTaka(p.amount)}</span>
                  </div>
                  <dl className="grid grid-cols-[minmax(0,1fr)] gap-0.5 text-sm text-ink-muted">
                    <div>
                      {BILLING_METHOD_LABELS[p.method]} · {p.months} month{p.months === 1 ? '' : 's'}
                    </div>
                    <div className="break-words tabular">
                      From {p.senderNumber} · TrxID {p.transactionId}
                    </div>
                    <div className="text-xs text-ink-faint">
                      {formatDateTime(p.createdAt)} · {p.submittedBy ?? '—'}
                    </div>
                  </dl>
                  {p.status === 'pending' ? <PaymentReview payment={p} /> : <ReviewedNote payment={p} />}
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={list.meta.page}
            perPage={list.meta.perPage}
            total={list.meta.total}
            path="/admin/payments"
            params={{ status }}
          />
        </>
      )}
    </div>
  );
}

function ReviewedNote({ payment: p }: { payment: AdminPaymentDto }) {
  return (
    <div className="text-xs text-ink-muted">
      {ADMIN_STATUS_LABELS[p.status]} {formatDateTime(p.reviewedAt)}
      {p.reviewedBy ? ` by ${p.reviewedBy}` : ''}
      {p.rejectReason ? <div className="break-words">{p.rejectReason}</div> : null}
    </div>
  );
}
