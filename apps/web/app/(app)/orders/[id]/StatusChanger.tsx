'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@ph/shared';
import { api } from '@/lib/client-api';

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
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="font-semibold">Change status</h2>
      {error ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p> : null}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-md bg-paper p-3 text-sm">
          <p>
            Mark this order <strong>{ORDER_STATUS_LABELS[confirming].toLowerCase()}</strong>?{' '}
            {confirming === 'returned'
              ? 'Its sale leaves your revenue and the courier and return charges count as a loss. Stock goes back on the shelf.'
              : 'It will no longer count in any figure. Stock goes back on the shelf.'}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-danger" disabled={pending} onClick={() => change(confirming)}>
              {pending ? 'Saving…' : `Mark ${ORDER_STATUS_LABELS[confirming].toLowerCase()}`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
              Keep {ORDER_STATUS_LABELS[status].toLowerCase()}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowed.map((to) => (
            <button
              key={to}
              type="button"
              disabled={pending}
              className={NEEDS_CONFIRMATION.includes(to) ? 'btn-secondary text-loss' : 'btn-secondary'}
              onClick={() => (NEEDS_CONFIRMATION.includes(to) ? setConfirming(to) : change(to))}
            >
              {ORDER_STATUS_LABELS[to]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
