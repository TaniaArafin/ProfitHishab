'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { formatTaka, ORDER_STATUS_LABELS, type OrderListItemDto, type OrderStatus } from '@ph/shared';
import { Avatar, StatusPill, TableCard } from '@/components/ui';
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
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const plural = selected.size === 1 ? '' : 's';

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
        <Alert variant={message.tone === 'gain' ? 'success' : 'destructive'} role="status">
          {message.text}
        </Alert>
      ) : null}

      {selected.size > 0 ? (
        // Phone: stays below the sticky top bar; desktop has no top bar.
        <div className="sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5 text-sm shadow-soft sm:px-4 lg:top-2">
          <span className="font-semibold text-ink">{selected.size} selected</span>
          <span className="text-ink-muted">Mark as:</span>
          <Button type="button" variant="link" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {BULK_TARGETS.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={s === 'cancelled' ? 'destructive-outline' : 'secondary'}
                className="min-h-10 sm:min-h-8"
                onClick={() => setConfirming(s)}
              >
                {ORDER_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        {confirming ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Mark {selected.size} order{plural} {ORDER_STATUS_LABELS[confirming].toLowerCase()}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirming === 'cancelled'
                  ? 'Cancelled orders no longer count in any figure. Their stock goes back on the shelf.'
                  : 'Orders that cannot move to this status are skipped and listed afterwards.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
              <Button
                type="button"
                variant={confirming === 'cancelled' ? 'destructive' : 'default'}
                disabled={pending}
                onClick={() => apply(confirming)}
              >
                {pending ? 'Updating…' : 'Confirm'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      {/* Tablet and desktop: table */}
      <TableCard className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all orders on this page"
                  checked={allSelected}
                  onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)))}
                />
              </TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="hidden lg:table-cell">Courier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} data-state={selected.has(o.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox aria-label={`Select order #${o.orderNo}`} checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                </TableCell>
                <TableCell>
                  <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:underline">
                    #{o.orderNo}
                  </Link>
                  <div className="text-xs text-ink-faint">
                    {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar name={o.customer.name} />
                    <div className="min-w-0">
                      <div className="max-w-[14rem] truncate font-medium">{o.customer.name}</div>
                      <div className="text-xs text-ink-faint tabular">{o.customer.phone}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular text-ink-muted">{o.orderDate}</TableCell>
                <TableCell className="hidden text-ink-muted lg:table-cell">{o.courier?.name ?? '—'}</TableCell>
                <TableCell>
                  <StatusPill status={o.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-semibold tabular">{formatTaka(o.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      {/* Phone: stacked cards (SRS section 9) */}
      <ul className="flex flex-col gap-2 md:hidden">
        {orders.map((o) => (
          <li key={o.id}>
            <Card className={selected.has(o.id) ? 'flex items-start gap-3 bg-brand-soft/40 p-3' : 'flex items-start gap-3 p-3'}>
              <Checkbox
                className="mt-1"
                aria-label={`Select order #${o.orderNo}`}
                checked={selected.has(o.id)}
                onCheckedChange={() => toggle(o.id)}
              />
              <Link href={`/orders/${o.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">#{o.orderNo}</span>
                  <StatusPill status={o.status} />
                </div>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{o.customer.name}</span>
                  <span className="shrink-0 font-medium tabular">{formatTaka(o.total)}</span>
                </div>
                <div className="truncate text-xs text-ink-faint tabular">
                  {o.orderDate} · {o.courier?.name ?? 'No courier'}
                </div>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
