import type { Metadata } from 'next';
import { Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CustomerProfileDto, type OrderListItemDto, type Paginated } from '@ph/shared';
import type { ReactNode } from 'react';
import { Money, PageHeader, StatusPill } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
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
          <Button asChild className="max-w-full">
            <Link href={`/orders/new?phone=${c.phone}`}>
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="truncate">New order for {c.name.split(' ')[0]}</span>
            </Link>
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Customer figures">
        <Stat label="Orders" value={c.totalOrders} />
        <Stat label="Delivered" value={c.deliveredOrders} />
        <Stat label="Returned" value={c.returnedOrders} bad={c.returnedOrders > 0} />
        <Stat label="Total spent" value={formatTaka(c.totalSpent)} />
        <Stat label="Profit generated" value={<Money value={c.profitGenerated} tone />} />
      </section>

      <Card role="region" aria-labelledby="history-title" className="overflow-hidden">
        <CardTitle id="history-title" className="border-b border-line px-4 py-3">
          Order history
        </CardTitle>
        {orders.data.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">No orders yet.</p>
        ) : (
          <Table>
            <TableBody>
              {orders.data.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="px-3 sm:px-4 lg:px-5">
                    <Link href={`/orders/${o.id}`} className="font-semibold text-ink hover:underline">
                      #{o.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-3 tabular text-ink-muted sm:px-4 lg:px-5">{o.orderDate}</TableCell>
                  <TableCell className="px-3 sm:px-4 lg:px-5">
                    <StatusPill status={o.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap px-3 text-right tabular sm:px-4 lg:px-5">{formatTaka(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: ReactNode; bad?: boolean }) {
  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col gap-1 p-4 hover:-translate-y-0.5 hover:border-schist-300 hover:shadow-lift',
        bad && 'border-loss/30 bg-loss-soft',
      )}
    >
      <span className={cn('text-xs font-medium', bad ? 'text-loss' : 'text-ink-muted')}>{label}</span>
      <span className={cn('truncate text-lg font-semibold tabular', bad && 'text-loss')}>{value}</span>
    </Card>
  );
}
