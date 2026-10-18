import type { Metadata } from 'next';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CustomerDto, type Paginated } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Avatar, EmptyState, PageHeader, Pagination } from '@/components/ui';
import { apiGet, qs } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Customers' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SORTS = [
  { value: '-last', label: 'Last order' },
  { value: '-spent', label: 'Most spent' },
  { value: '-orders', label: 'Most orders' },
  { value: '-returned', label: 'Most returns' },
  { value: 'name', label: 'Name A–Z' },
];

export default async function CustomersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const customers = await apiGet<Paginated<CustomerDto>>(`/customers?${qs(sp, ['q', 'sort', 'page'])}`);
  const q = typeof sp.q === 'string' ? sp.q : '';
  const sort = typeof sp.sort === 'string' ? sp.sort : '-last';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Users} title="Customers" description="Created automatically from orders. The phone number identifies a customer." />
      <form className="card flex flex-wrap items-end gap-2 p-3" action="/customers">
        <div className="min-w-[200px] flex-1">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input id="q" name="q" className="input pl-10" placeholder="Name or phone" defaultValue={q} />
          </div>
        </div>
        <label className="sr-only" htmlFor="sort">
          Sort
        </label>
        <SelectField id="sort" name="sort" className="w-auto min-w-[10rem]" defaultValue={sort} options={SORTS} />
        <button className="btn-secondary" type="submit">
          Apply
        </button>
      </form>

      {customers.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? 'No customers match' : 'No customers yet'}
          body={q ? 'Try another name or number.' : 'Customers appear here when you create orders.'}
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line/70 bg-paper/50">
                  <tr>
                    <th className="th">Customer</th>
                    <th className="th text-right">Orders</th>
                    <th className="th text-right">Delivered</th>
                    <th className="th text-right">Returned</th>
                    <th className="th text-right">Spent</th>
                    <th className="th text-right">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {customers.data.map((c) => (
                    <tr key={c.id} className="hover:bg-paper/60">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <div className="min-w-0">
                            <Link href={`/customers/${c.id}`} className="font-semibold text-ink hover:text-ink">
                              {c.name}
                            </Link>
                            <div className="text-xs text-ink-faint tabular">{c.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td text-right tabular">{c.totalOrders}</td>
                      <td className="td text-right tabular">{c.deliveredOrders}</td>
                      <td className={`td text-right tabular ${c.returnedOrders > 0 ? 'text-loss' : ''}`}>{c.returnedOrders}</td>
                      <td className="td text-right tabular">{formatTaka(c.totalSpent)}</td>
                      <td className="td text-right tabular text-ink-muted">{c.lastOrderDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={customers.meta.page}
            perPage={customers.meta.perPage}
            total={customers.meta.total}
            path="/customers"
            params={{ q: q || undefined, sort }}
          />
        </>
      )}
    </div>
  );
}
