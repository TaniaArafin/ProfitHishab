import type { Metadata } from 'next';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CustomerDto, type Paginated } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Avatar, EmptyState, PageHeader, Pagination, TableCard } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
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
      <Card>
        <form className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end" action="/customers">
          <div className="min-w-0 flex-1 sm:min-w-[200px]">
            <Label className="sr-only" htmlFor="q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input id="q" name="q" className="pl-10" placeholder="Name or phone" defaultValue={q} />
            </div>
          </div>
          <div className="flex gap-2">
            <Label className="sr-only" htmlFor="sort">
              Sort
            </Label>
            <SelectField id="sort" name="sort" className="min-w-0 flex-1 sm:w-auto sm:min-w-[10rem]" defaultValue={sort} options={SORTS} />
            <Button variant="secondary" type="submit">
              Apply
            </Button>
          </div>
        </form>
      </Card>

      {customers.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? 'No customers match' : 'No customers yet'}
          body={q ? 'Try another name or number.' : 'Customers appear here when you create orders.'}
        />
      ) : (
        <>
          {/* Tablet and up: table */}
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={c.name} />
                        <div className="min-w-0">
                          <Link href={`/customers/${c.id}`} className="block max-w-[16rem] truncate font-semibold text-ink hover:underline">
                            {c.name}
                          </Link>
                          <div className="text-xs text-ink-faint tabular">{c.phone}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{c.totalOrders}</TableCell>
                    <TableCell className="text-right tabular">{c.deliveredOrders}</TableCell>
                    <TableCell className={cn('text-right tabular', c.returnedOrders > 0 && 'text-loss')}>{c.returnedOrders}</TableCell>
                    <TableCell className="text-right tabular">{formatTaka(c.totalSpent)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular text-ink-muted">{c.lastOrderDate ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          {/* Phone: stacked cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {customers.data.map((c) => (
              <li key={c.id}>
                <Card className="transition hover:border-schist-300">
                  <Link href={`/customers/${c.id}`} className="flex items-center gap-3 rounded-2xl p-3">
                    <Avatar name={c.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{c.name}</span>
                        <span className="shrink-0 text-sm font-medium tabular">{formatTaka(c.totalSpent)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-faint">
                        <span className="tabular">{c.phone}</span>
                        <span className="shrink-0 tabular">{c.lastOrderDate ?? '—'}</span>
                      </div>
                      <div className="text-xs text-ink-muted">
                        {c.totalOrders} order{c.totalOrders === 1 ? '' : 's'} · {c.deliveredOrders} delivered ·{' '}
                        <span className={cn(c.returnedOrders > 0 && 'text-loss')}>{c.returnedOrders} returned</span>
                      </div>
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

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
