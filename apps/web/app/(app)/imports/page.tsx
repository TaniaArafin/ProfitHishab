import type { Metadata } from 'next';
import { FileUp } from 'lucide-react';
import type { ImportListItemDto } from '@ph/shared';
import { EmptyState, PageHeader, Pagination } from '@/components/ui';
import { apiGet, qs } from '@/lib/server-api';
import { ImportHistory } from './ImportHistory';
import { ImportUploadDialog } from './ImportUploadDialog';

export const metadata: Metadata = { title: 'Import orders' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ImportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const list = await apiGet<{ data: ImportListItemDto[]; meta: { page: number; perPage: number; total: number } }>(
    `/imports?${qs(sp, ['page'])}`,
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={FileUp}
        title="Import orders"
        description="Bring in your orders from Excel or CSV and see their profit."
        actions={<ImportUploadDialog defaultOpen={sp.upload === '1'} />}
      />
      {list.data.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="No imports yet"
          body="Use the Import orders button above to bring in your past orders from an Excel or CSV file and see their profit."
        />
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="import-history">
          <h2 id="import-history" className="text-lg font-semibold">
            Import history
          </h2>
          <ImportHistory imports={list.data} />
          <Pagination page={list.meta.page} perPage={list.meta.perPage} total={list.meta.total} path="/imports" params={{}} />
        </section>
      )}
    </div>
  );
}
