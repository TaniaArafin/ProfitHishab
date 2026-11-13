import type { Metadata } from 'next';
import { FileUp, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ImportListItemDto } from '@ph/shared';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { apiGet, qs } from '@/lib/server-api';
import { ImportHistory } from './ImportHistory';

export const metadata: Metadata = { title: 'Imports' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ImportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const list = await apiGet<{ data: ImportListItemDto[]; meta: { page: number; perPage: number; total: number } }>(
    `/imports?${qs(sp, ['page'])}`,
  );
  const upload = (
    <Button asChild>
      <Link href="/imports/new">
        <Plus className="h-4 w-4" /> Import orders
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={FileUp} title="Imports" description="Past orders brought in from Excel or CSV files." actions={upload} />
      {list.data.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="No imports yet"
          body="Bring in your past orders from an Excel or CSV file to see their profit."
          actions={upload}
        />
      ) : (
        <>
          <ImportHistory imports={list.data} />
          <Pagination page={list.meta.page} perPage={list.meta.perPage} total={list.meta.total} path="/imports" params={{}} />
        </>
      )}
    </div>
  );
}
