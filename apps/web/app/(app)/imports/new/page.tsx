import type { Metadata } from 'next';
import { FileUp } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { UploadStep } from './UploadStep';

export const metadata: Metadata = { title: 'Import orders' };

export default function NewImportPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={FileUp} title="Import orders" description="Bring in your past orders from Excel or CSV." />
      <UploadStep />
    </div>
  );
}
