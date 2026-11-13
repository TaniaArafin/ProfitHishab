import type { Metadata } from 'next';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import type { ImportDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/server-api';
import { formatImportTime } from '../status';
import { ImportWizard } from './ImportWizard';

export const metadata: Metadata = { title: 'Import' };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await apiGet<{ data: ImportDto }>(`/imports/${id}`);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader
        icon={FileSpreadsheet}
        title={data.fileName}
        description={`Uploaded ${formatImportTime(data.createdAt)}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/imports">
              <ArrowLeft className="h-4 w-4" /> All imports
            </Link>
          </Button>
        }
      />
      {/* key: another import starts its wizard afresh. */}
      <ImportWizard key={data.id} imp={data} />
    </div>
  );
}
