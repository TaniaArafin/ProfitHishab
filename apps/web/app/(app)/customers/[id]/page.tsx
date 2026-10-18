import type { Metadata } from 'next';
import { Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CustomerProfileDto, type OrderListItemDto, type Paginated } from '@ph/shared';
import { Money, PageHeader, StatusPill } from '@/components/ui';
import { apiGet } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: c }, orders] = await Promise.all([
    apiGet<{ data: CustomerProfileDto }>(`/customers/${id}`),
    apiGet<Paginated<OrderListItemDto>>(`/orders?customerId=${id}&perPage=50`),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={UserRound}
        title={c.name}
        description={
          <>
            <span className="tabular">{c.phone}</span>
            {c.address ? ` · ${c.address}` : ''}
          </>
        }
        actions={
          <Link href={`/orders/new?phone=${c.phone}`} className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New order for {c.name.split(' ')[0]}
          </Link>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Customer figures">
        <Stat label="Orders" value={c.totalOrders} />
        <Stat label="Delivered" value={c.deliveredOrders} />
        <Stat label="Returned" value={c.returnedOrders} bad={c.returnedOrders > 0} />
        <Stat label="Total spent" value={formatTaka(c.totalSpent)} />
        <Stat label="Profit generated" value={<Money value={c.profitGenerated} tone />} />
      </section>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-4 py-3 font-semibold">Order history</h2>
        {orders.data.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line/60">
              {orders.data.map((o) => (
                <tr key={o.id}>
                  <td className="td">
                    <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:underline">
                      #{o.orderNo}
                    </Link>
                  </td>
                  <td className="td tabular text-ink-muted">{o.orderDate}</td>
                  <td className="td">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="td text-right tabular">{formatTaka(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className={`card card-hover flex flex-col gap-1 p-4 ${bad ? 'border-loss/30 bg-loss-soft' : ''}`}>
      <span className={`text-xs font-medium ${bad ? 'text-loss' : 'text-ink-muted'}`}>{label}</span>
      <span className={`text-lg font-semibold tabular ${bad ? 'text-loss' : ''}`}>{value}</span>
    </div>
  );
}
