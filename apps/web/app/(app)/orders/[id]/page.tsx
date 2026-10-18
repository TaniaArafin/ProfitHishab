import type { Metadata } from 'next';
import { ArrowLeft, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type OrderDetailDto } from '@ph/shared';
import { Money, PageHeader, StatusPill } from '@/components/ui';
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
          <Link href="/orders" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            All orders
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line/70 bg-paper/50">
                  <tr>
                    <th className="th">Item</th>
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Price</th>
                    <th className="th text-right">Cost</th>
                    <th className="th text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {o.items.map((item) => (
                    <tr key={item.id}>
                      <td className="td">
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-xs text-ink-faint">{item.sku}</div>
                      </td>
                      <td className="td text-right tabular">{item.quantity}</td>
                      <td className="td text-right tabular">{formatTaka(item.unitPrice)}</td>
                      <td className="td text-right tabular text-ink-muted">{formatTaka(item.unitCost)}</td>
                      <td className="td text-right font-medium tabular">{formatTaka(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
              Price and cost are saved as they were when the order was placed.
            </p>
          </section>

          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Customer</h2>
              <Link href={`/customers/${o.customer.id}`} className="mt-2 block font-semibold text-ink hover:underline">
                {o.customer.name}
              </Link>
              <div className="text-sm tabular text-ink-muted">{o.customer.phone}</div>
              {o.deliveryAddress ? <p className="mt-1 text-sm">{o.deliveryAddress}</p> : null}
            </div>
            {o.note ? (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Note</h2>
                <p className="mt-2 text-sm">{o.note}</p>
              </div>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">History</h2>
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {o.history.map((h) => (
                <li key={`${h.changedAt}-${h.toStatus}`} className="flex justify-between gap-3">
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
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <StatusChanger orderId={o.id} status={o.status} allowed={o.allowedStatuses} />

          <section className="card flex flex-col gap-2 p-5 text-sm">
            <h2 className="mb-1 font-semibold">
              {o.status === 'returned' ? 'Loss on this return' : pending ? 'Profit if delivered' : 'Profit on this order'}
            </h2>
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
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <span>{o.status === 'cancelled' ? 'Cancelled, not counted' : 'Profit'}</span>
              <Money value={o.profit} tone />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-muted">{label}</span>
      <Money value={value} />
    </div>
  );
}
