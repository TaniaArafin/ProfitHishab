'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BILLING_METHOD_LABELS, BILLING_PERIOD_DAYS, formatTaka, type AdminPaymentDto } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

/** Confirm or reject one pending payment. Reviewed payments show no actions. */
export function PaymentReview({ payment }: { payment: AdminPaymentDto }) {
  const router = useRouter();
  const [open, setOpen] = useState<'confirm' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  if (payment.status !== 'pending') return null;

  async function send(action: 'confirm' | 'reject') {
    if (pending) return;
    setPending(true);
    setError(null);
    const path = `/admin/payments/${payment.id}/${action}`;
    const res = action === 'reject' ? await api('POST', path, { reason: reason.trim() }) : await api('POST', path);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(null);
    setReason('');
    refreshData(router);
  }

  const onOpenChange = (which: 'confirm' | 'reject') => (next: boolean) => {
    if (pending) return;
    setOpen(next ? which : null);
    setError(null);
  };
  const reasonError = fieldError(error, 'reason');
  const reasonLength = reason.trim().length;
  const method = BILLING_METHOD_LABELS[payment.method];
  const reasonId = `reject-reason-${payment.id}`;

  return (
    <div className="flex gap-2">
      <AlertDialog open={open === 'confirm'} onOpenChange={onOpenChange('confirm')}>
        <AlertDialogTrigger asChild>
          <Button className="flex-1 sm:flex-none" disabled={pending}>
            Confirm
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Confirm ${formatTaka(payment.amount)} from ${payment.senderNumber} (TrxID ${payment.transactionId})? This adds ${payment.months * BILLING_PERIOD_DAYS} days of access. Check your ${method} statement first.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <Alert variant="destructive">{error.message}</Alert> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void send('confirm');
              }}
            >
              {pending ? 'Confirming…' : 'Confirm payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={open === 'reject'} onOpenChange={onOpenChange('reject')}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive-outline" className="flex-1 sm:flex-none" disabled={pending}>
            Reject
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this payment?</AlertDialogTitle>
            <AlertDialogDescription>The seller sees your reason and can send a new payment.</AlertDialogDescription>
          </AlertDialogHeader>
          {error && !reasonError ? <Alert variant="destructive">{error.message}</Alert> : null}
          <div>
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. We did not receive this TrxID"
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
            />
            {reasonError ? (
              <p className="mt-1 text-sm text-loss" id={`${reasonId}-error`}>
                {reasonError}
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-faint">3 to 300 characters.</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || reasonLength < 3}
              onClick={(e) => {
                e.preventDefault();
                void send('reject');
              }}
            >
              {pending ? 'Rejecting…' : 'Reject payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
