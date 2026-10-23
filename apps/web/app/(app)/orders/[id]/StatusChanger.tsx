'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@ph/shared';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

const NEEDS_CONFIRMATION: OrderStatus[] = ['cancelled', 'returned'];

/** FR-ORD-07: only allowed moves are offered; cancel and return are confirmed in-page. */
export function StatusChanger({ orderId, status, allowed }: { orderId: string; status: OrderStatus; allowed: OrderStatus[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(to: OrderStatus) {
    setPending(true);
    setError(null);
    const res = await api('POST', `/orders/${orderId}/status`, { status: to });
    setPending(false);
    setConfirming(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    refreshData(router);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {allowed.map((to) => (
            <Button
              key={to}
              type="button"
              disabled={pending}
              variant={NEEDS_CONFIRMATION.includes(to) ? 'destructive-outline' : 'secondary'}
              onClick={() => (NEEDS_CONFIRMATION.includes(to) ? setConfirming(to) : change(to))}
            >
              {ORDER_STATUS_LABELS[to]}
            </Button>
          ))}
        </div>
      </CardContent>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        {confirming ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this order {ORDER_STATUS_LABELS[confirming].toLowerCase()}?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirming === 'returned'
                  ? 'Its sale leaves your revenue and the courier and return charges count as a loss. Stock goes back on the shelf.'
                  : 'It will no longer count in any figure. Stock goes back on the shelf.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Keep {ORDER_STATUS_LABELS[status].toLowerCase()}</AlertDialogCancel>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => change(confirming)}>
                {pending ? 'Saving…' : `Mark ${ORDER_STATUS_LABELS[confirming].toLowerCase()}`}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </Card>
  );
}
