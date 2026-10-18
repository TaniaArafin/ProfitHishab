'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { formatTaka, ORDER_STATUS_LABELS, type OrderListItemDto, type OrderStatus } from '@ph/shared';
import { Avatar, StatusPill } from '@/components/ui';
import { api } from '@/lib/client-api';
import { refreshData } from '@/lib/navigation';

const BULK_TARGETS: OrderStatus[] = ['confirmed', 'shipped', 'delivered', 'cancelled'];

/** FR-ORD-08/09: the list with row selection and a bulk status bar. */
export function OrdersTable({ orders }: { orders: OrderListItemDto[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const [message, setMessage] = useState<{ tone: 'gain' | 'loss'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function apply(status: OrderStatus) {
    setPending(true);
    const res = await api<{ updated: number; skipped: Array<{ orderNo: number; reason: string }> }>('POST', '/orders/bulk-status', {
      orderIds: [...selected],
      status,
    });
    setPending(false);
    setConfirming(null);
    if (!res.ok) {
      setMessage({ tone: 'loss', text: res.error.message });
      return;
    }
    const { updated, skipped } = res.data;
    setMessage({
      tone: skipped.length ? 'loss' : 'gain',
      text:
        `${updated} order${updated === 1 ? '' : 's'} marked ${ORDER_STATUS_LABELS[status].toLowerCase()}.` +
        (skipped.length ? ` Skipped ${skipped.map((s) => `#${s.orderNo}`).join(', ')}: ${skipped[0].reason}` : ''),
    });
    setSelected(new Set());
    refreshData(router);
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${message.tone === 'gain' ? 'bg-gain-soft text-gain' : 'bg-loss-soft text-loss'}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3 text-sm">
          <span className="font-semibold text-ink">{selected.size} selected</span>
          {confirming ? (
            <>
              <span>
                Mark {selected.size} order{selected.size === 1 ? '' : 's'} {ORDER_STATUS_LABELS[confirming].toLowerCase()}?
                {confirming === 'cancelled' ? ' Their stock goes back on the shelf.' : ''}
              </span>
              <button
                type="button"
                className={confirming === 'cancelled' ? 'btn-danger' : 'btn-primary'}
                disabled={pending}
                onClick={() => apply(confirming)}
              >
                {pending ? 'Updating…' : 'Confirm'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(null)}>
                Back
              </button>
            </>
          ) : (
            <>
              <span className="text-ink-muted">Mark as:</span>
              {BULK_TARGETS.map((s) => (
                <button key={s} type="button" className="btn-secondary py-1.5" onClick={() => setConfirming(s)}>
                  {ORDER_STATUS_LABELS[s]}
                </button>
              ))}
              <button type="button" className="ml-auto text-sm font-medium text-ink-muted underline" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* Desktop table */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line/70 bg-paper/50">
              <tr>
                <th className="th w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all orders on this page"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)))}
                  />
                </th>
                <th className="th">Order</th>
                <th className="th">Customer</th>
                <th className="th">Date</th>
                <th className="th">Courier</th>
                <th className="th">Status</th>
                <th className="th text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {orders.map((o) => (
                <tr key={o.id} className={selected.has(o.id) ? 'bg-brand-soft/40' : 'transition hover:bg-paper/60'}>
                  <td className="td">
                    <input
                      type="checkbox"
                      aria-label={`Select order #${o.orderNo}`}
                      checked={selected.has(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                  </td>
                  <td className="td">
                    <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:underline">
                      #{o.orderNo}
                    </Link>
                    <div className="text-xs text-ink-faint">
                      {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <Avatar name={o.customer.name} />
                      <div className="min-w-0">
                        <div className="font-medium">{o.customer.name}</div>
                        <div className="text-xs text-ink-faint tabular">{o.customer.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td tabular text-ink-muted">{o.orderDate}</td>
                  <td className="td text-ink-muted">{o.courier?.name ?? '—'}</td>
                  <td className="td">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="td text-right font-semibold tabular">{formatTaka(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phone: stacked cards (SRS section 9) */}
      <ul className="flex flex-col gap-2 md:hidden">
        {orders.map((o) => (
          <li key={o.id} className="card flex items-start gap-3 p-3">
            <input
              className="mt-1"
              type="checkbox"
              aria-label={`Select order #${o.orderNo}`}
              checked={selected.has(o.id)}
              onChange={() => toggle(o.id)}
            />
            <Link href={`/orders/${o.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">#{o.orderNo}</span>
                <StatusPill status={o.status} />
              </div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{o.customer.name}</span>
                <span className="font-medium tabular">{formatTaka(o.total)}</span>
              </div>
              <div className="text-xs text-ink-faint tabular">
                {o.orderDate} · {o.courier?.name ?? 'No courier'}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
