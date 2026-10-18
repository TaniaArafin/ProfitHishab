import type { Metadata } from 'next';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { MissingCostForm, type MissingCostRow } from './MissingCostForm';

export const metadata: Metadata = { title: 'Fix missing costs' };

export default async function MissingCostPage() {
  const { data } = await apiGet<{ data: MissingCostRow[] }>('/products/missing-cost');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={TriangleAlert}
        title="Fix missing costs"
        description="Products with a cost of 0 make your profit look higher than it is."
      />
      {data.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Every product has a cost"
          body="Your profit figures use real product costs."
          actions={
            <Link href="/dashboard" className="btn-primary">
              Back to dashboard
            </Link>
          }
        />
      ) : (
        <MissingCostForm rows={data} />
      )}
    </div>
  );
}
