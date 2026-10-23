import type { Metadata } from 'next';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type OrderDetailDto } from '@ph/shared';
import { Money, PageHeader, StatusPill, TableCard } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/server-api';
import { StatusChanger } from './StatusChanger';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: o } = await apiGet<{ data: OrderDetailDto }>(`/orders/${id}`);
  const pending = !['delivered', 'returned', 'cancelled'].includes(o.status);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ReceiptText}
        title={`Order #${o.orderNo}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={o.status} />
            <span className="tabular">{o.orderDate}</span>
            <span>· {PAYMENT_METHOD_LABELS[o.paymentMethod]}</span>
            {o.courier ? <span>· {o.courier.name}</span> : null}
            {o.source === 'import' ? <span>· Imported</span> : null}
          </span>
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="/orders">
              <ArrowLeft className="h-4 w-4" />
              All orders
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TableCard>
            {/* Tablet and desktop: table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-xs text-ink-faint">{item.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tabular">{item.quantity}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular">{formatTaka(item.unitPrice)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular text-ink-muted">{formatTaka(item.unitCost)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular">{formatTaka(item.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Phone: one block per item */}
            <ul className="divide-y divide-line/60 sm:hidden">
              {o.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{item.productName}</span>
                    <span className="shrink-0 font-medium tabular">{formatTaka(item.lineTotal)}</span>
                  </div>
                  <div className="text-xs text-ink-faint tabular">
                    {item.sku} · {item.quantity} × {formatTaka(item.unitPrice)} · cost {formatTaka(item.unitCost)}
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
              Price and cost are saved as they were when the order was placed.
            </p>
          </TableCard>

          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Customer</h2>
                <Link href={`/customers/${o.customer.id}`} className="mt-2 block break-words font-semibold text-ink hover:underline">
                  {o.customer.name}
                </Link>
                <div className="text-sm tabular text-ink-muted">{o.customer.phone}</div>
                {o.deliveryAddress ? <p className="mt-1 break-words text-sm">{o.deliveryAddress}</p> : null}
              </div>
              {o.note ? (
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Note</h2>
                  <p className="mt-2 break-words text-sm">{o.note}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">History</h2>
              <ol className="mt-3 flex flex-col gap-2 text-sm">
                {o.history.map((h) => (
                  <li key={`${h.changedAt}-${h.toStatus}`} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                    <span>
                      {h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus]} → ` : 'Created as '}
                      <strong>{ORDER_STATUS_LABELS[h.toStatus]}</strong>
                    </span>
                    <time className="text-ink-faint tabular" dateTime={h.changedAt}>
                      {new Date(h.changedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' })}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Below xl the side column sits under the order, two-up on tablets. */}
        <aside className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <StatusChanger orderId={o.id} status={o.status} allowed={o.allowedStatuses} />

          <Card>
            <CardHeader>
              <CardTitle>
                {o.status === 'returned' ? 'Loss on this return' : pending ? 'Profit if delivered' : 'Profit on this order'}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {o.status === 'returned' ? (
                <>
                  <Row label="Courier" value={-o.courierCost} />
                  <Row label="Packaging" value={-o.packagingCost} />
                  <Row label="Return charge" value={-o.returnCost} />
                </>
              ) : (
                <>
                  <Row label="Subtotal" value={o.subtotal} />
                  <Row label="Discount" value={-o.discount} />
                  <Row label="Delivery charge" value={o.deliveryCharge} />
                  <Row label="Product cost" value={-o.productCost} />
                  <Row label="Courier" value={-o.courierCost} />
                  <Row label="Packaging" value={-o.packagingCost} />
                </>
              )}
              <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-semibold">
                <span>{o.status === 'cancelled' ? 'Cancelled, not counted' : 'Profit'}</span>
                <Money value={o.profit} tone />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <Money value={value} />
    </div>
  );
}
