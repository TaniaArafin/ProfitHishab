import type { Metadata } from 'next';
import { Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { ACCESS_STATUS_LABELS, ACCESS_STATUSES, type AdminBusinessListItemDto, type Paginated } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { EmptyState, PageHeader, Pagination, TableCard } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet, qs } from '@/lib/server-api';
import { AccessBadge } from './AccessBadge';
import { formatDate, formatDateTime } from './format';

export const metadata: Metadata = { title: 'Admin' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...ACCESS_STATUSES.map((s) => ({ value: s, label: ACCESS_STATUS_LABELS[s] })),
];

/** Platform admins only: the API answers 404 to anyone else, which shows the not-found page. */
export default async function AdminPage({ searchParams }: Props) {
  const sp = await searchParams;
  const list = await apiGet<Paginated<AdminBusinessListItemDto>>(`/admin/businesses?${qs(sp, ['q', 'status', 'page'])}`);
  const q = typeof sp.q === 'string' ? sp.q : '';
  const status = typeof sp.status === 'string' ? sp.status : '';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={ShieldCheck}
        title="Admin"
        description={`${list.meta.total} business${list.meta.total === 1 ? '' : 'es'}${status || q ? ' match' : ' signed up'}. Open one to change access, block it or send a password link.`}
      />
      <Card>
        <form className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-end" action="/admin">
          <div className="min-w-0 flex-1 sm:min-w-[220px]">
            <Label className="sr-only" htmlFor="q">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input id="q" name="q" className="pl-10" placeholder="Business, owner, email or phone" defaultValue={q} />
            </div>
          </div>
          <div className="flex gap-2">
            <Label className="sr-only" htmlFor="status">
              Status
            </Label>
            <SelectField
              id="status"
              name="status"
              className="min-w-0 flex-1 sm:w-auto sm:min-w-[11rem]"
              defaultValue={status}
              options={STATUS_OPTIONS}
            />
            <Button variant="secondary" type="submit">
              Apply
            </Button>
          </div>
        </form>
      </Card>

      {list.data.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={q || status ? 'No businesses match' : 'No sign-ups yet'}
          body={q || status ? 'Try another search or status.' : undefined}
        />
      ) : (
        <>
          <TableCard className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Business</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="hidden lg:table-cell">Last active</TableHead>
                  <TableHead className="hidden xl:table-cell">Signed up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        className="block max-w-[14rem] truncate font-semibold text-ink hover:underline"
                      >
                        {b.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[14rem] truncate font-medium">{b.owner.name}</div>
                      <div className="max-w-[14rem] truncate text-xs text-ink-faint tabular">{b.owner.phone ?? b.owner.email ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <AccessBadge status={b.status} daysLeft={b.daysLeft} />
                    </TableCell>
                    <TableCell className="text-right tabular">{b.orderCount}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-ink-muted tabular lg:table-cell">
                      {formatDateTime(b.lastActiveAt)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-ink-muted tabular xl:table-cell">
                      {formatDate(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          <ul className="flex flex-col gap-2 md:hidden">
            {list.data.map((b) => (
              <li key={b.id}>
                <Card className="transition hover:border-schist-300">
                  <Link href={`/admin/businesses/${b.id}`} className="flex flex-col gap-1.5 rounded-2xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{b.name}</span>
                      <AccessBadge status={b.status} daysLeft={b.daysLeft} />
                    </div>
                    <div className="truncate text-sm text-ink-muted">
                      {b.owner.name} · <span className="tabular">{b.owner.phone ?? b.owner.email ?? '—'}</span>
                    </div>
                    <div className="text-xs text-ink-faint">
                      {b.orderCount} order{b.orderCount === 1 ? '' : 's'} · last active {formatDateTime(b.lastActiveAt)}
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>

          <Pagination
            page={list.meta.page}
            perPage={list.meta.perPage}
            total={list.meta.total}
            path="/admin"
            params={{ q: q || undefined, status: status || undefined }}
          />
        </>
      )}
    </div>
  );
}
