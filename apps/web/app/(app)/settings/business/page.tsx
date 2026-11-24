import type { Metadata } from 'next';
import type { BusinessDto } from '@ph/shared';
import { apiGet } from '@/lib/server-api';
import { BusinessDetailsForm } from './BusinessDetailsForm';
import { LogoUpload } from './LogoUpload';

export const metadata: Metadata = { title: 'Business settings' };

export default async function BusinessSettingsPage() {
  const { data: business } = await apiGet<{ data: BusinessDto }>('/business');
  return (
    <div className="flex flex-col gap-6">
      <LogoUpload logoUrl={business.logoUrl} />
      <BusinessDetailsForm business={business} />
    </div>
  );
}
