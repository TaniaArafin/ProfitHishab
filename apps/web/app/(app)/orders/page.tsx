import type { Metadata } from 'next';
import { Plus, Search, SearchX, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type CourierDto, type OrderListItemDto, type Paginated } from '@ph/shared';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/SelectField';
import { apiGet, qs } from '@/lib/server-api';
import { OrdersTable } from './OrdersTable';

export const metadata: Metadata = { title: 'Orders' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const FILTER_KEYS = ['status', 'q', 'from', 'to', 'courierId', 'paymentMethod', 'customerId', 'page'];

export default async function OrdersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const query = qs(sp, FILTER_KEYS);
  const countsQuery = qs(
    sp,
    FILTER_KEYS.filter((k) => k !== 'status' && k !== 'page'),
  );
  const [orders, counts, couriers] = await Promise.all([
    apiGet<Paginated<OrderListItemDto>>(`/orders?${query}`),
    apiGet<{ data: Record<string, number> }>(`/orders/status-counts?${countsQuery}`),
    apiGet<{ data: CourierDto[] }>('/couriers'),
  ]);

  const current = typeof sp.status === 'string' ? sp.status : undefined;
  const all = Object.values(counts.data).reduce((a, b) => a + b, 0);
  const keep = Object.fromEntries(FILTER_KEYS.filter((k) => k !== 'page').map((k) => [k, typeof sp[k] === 'string' ? sp[k] : undefined]));
  const tabHref = (status?: string) =>
    `/orders?${new URLSearchParams(Object.entries({ ...keep, status }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const hasFilters = Boolean(sp.q || sp.from || sp.to || sp.courierId);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ShoppingBag}
        title="Orders"
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              New order
            </Link>
          </Button>
        }
      />

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Order status">
        <Tab href={tabHref()} active={!current} label="All" count={all} />
        {ORDER_STATUSES.map((s) => (
          <Tab key={s} href={tabHref(s)} active={current === s} label={ORDER_STATUS_LABELS[s]} count={counts.data[s] ?? 0} />
        ))}
      </nav>

      <Card>
        <form className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end" action="/orders">
          {current ? <input type="hidden" name="status" value={current} /> : null}
          <div className="sm:min-w-[220px] sm:flex-1">
            <Label className="sr-only" htmlFor="q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                id="q"
                name="q"
                className="pl-10"
                placeholder="Order #, customer name or phone"
                defaultValue={typeof sp.q === 'string' ? sp.q : ''}
              />
            </div>
          </div>
          <div>
            <Label className="sr-only" htmlFor="courierId">
              Courier
            </Label>
            <SelectField
              id="courierId"
              name="courierId"
              className="sm:w-auto sm:min-w-[10rem]"
              defaultValue={typeof sp.courierId === 'string' ? sp.courierId : ''}
              options={[{ value: '', label: 'All couriers' }, ...couriers.data.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div>
              <Label className="sr-only" htmlFor="from">
                From
              </Label>
              <Input id="from" name="from" type="date" className="sm:w-auto" defaultValue={typeof sp.from === 'string' ? sp.from : ''} />
            </div>
            <div>
              <Label className="sr-only" htmlFor="to">
                To
              </Label>
              <Input id="to" name="to" type="date" className="sm:w-auto" defaultValue={typeof sp.to === 'string' ? sp.to : ''} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" type="submit" className="flex-1 sm:flex-none">
              Filter
            </Button>
            {hasFilters ? (
              <Button asChild variant="secondary" className="flex-1 sm:flex-none">
                <Link href={current ? `/orders?status=${current}` : '/orders'}>Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {orders.data.length === 0 ? (
        all === 0 && !hasFilters ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            body="Create your first order to start tracking profit."
            actions={
              <Button asChild>
                <Link href="/orders/new">New order</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState icon={SearchX} title="No orders match" body="Try another status, date range or search." />
        )
      ) : (
        <>
          <OrdersTable orders={orders.data} />
          <Pagination page={orders.meta.page} perPage={orders.meta.perPage} total={orders.meta.total} path="/orders" params={keep} />
        </>
      )}
    </div>
  );
}

function Tab({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={clsx(
        'flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
        active
          ? 'border-transparent bg-brand text-schist-100 shadow-soft'
          : 'border-line/80 bg-card text-ink-muted shadow-[0_1px_2px_rgba(24,31,20,0.04)] hover:border-ink/15 hover:text-ink',
      )}
    >
      {label}
      <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] tabular', active ? 'bg-white/15' : 'bg-paper')}>{count}</span>
    </Link>
  );
}
