import type { Metadata } from 'next';
import { Plus, Search, SearchX, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type CourierDto, type OrderListItemDto, type Paginated } from '@ph/shared';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
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
          <Link href="/orders/new" className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New order
          </Link>
        }
      />

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Order status">
        <Tab href={tabHref()} active={!current} label="All" count={all} />
        {ORDER_STATUSES.map((s) => (
          <Tab key={s} href={tabHref(s)} active={current === s} label={ORDER_STATUS_LABELS[s]} count={counts.data[s] ?? 0} />
        ))}
      </nav>

      <form className="card flex flex-wrap items-end gap-2 p-3" action="/orders">
        {current ? <input type="hidden" name="status" value={current} /> : null}
        <div className="min-w-[200px] flex-1">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              id="q"
              name="q"
              className="input pl-10"
              placeholder="Order #, customer name or phone"
              defaultValue={typeof sp.q === 'string' ? sp.q : ''}
            />
          </div>
        </div>
        <div>
          <label className="sr-only" htmlFor="courierId">
            Courier
          </label>
          <SelectField
            id="courierId"
            name="courierId"
            className="w-auto min-w-[10rem]"
            defaultValue={typeof sp.courierId === 'string' ? sp.courierId : ''}
            options={[{ value: '', label: 'All couriers' }, ...couriers.data.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <label className="sr-only" htmlFor="from">
          From
        </label>
        <input id="from" name="from" type="date" className="input w-auto" defaultValue={typeof sp.from === 'string' ? sp.from : ''} />
        <label className="sr-only" htmlFor="to">
          To
        </label>
        <input id="to" name="to" type="date" className="input w-auto" defaultValue={typeof sp.to === 'string' ? sp.to : ''} />
        <button className="btn-secondary" type="submit">
          Filter
        </button>
        {hasFilters ? (
          <Link className="btn-secondary" href={current ? `/orders?status=${current}` : '/orders'}>
            Clear
          </Link>
        ) : null}
      </form>

      {orders.data.length === 0 ? (
        all === 0 && !hasFilters ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            body="Create your first order to start tracking profit."
            actions={
              <Link href="/orders/new" className="btn-primary">
                New order
              </Link>
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
        'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition',
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
