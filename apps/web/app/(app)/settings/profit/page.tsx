import type { Metadata } from 'next';
import type { BusinessDto, CourierDto } from '@ph/shared';
import { apiGet } from '@/lib/server-api';
import { ProfitDefaultsForm } from './ProfitDefaultsForm';

export const metadata: Metadata = { title: 'Profit defaults' };

export default async function ProfitSettingsPage() {
  const [{ data: business }, { data: couriers }] = await Promise.all([
    apiGet<{ data: BusinessDto }>('/business'),
    apiGet<{ data: CourierDto[] }>('/couriers'),
  ]);
  return <ProfitDefaultsForm business={business} couriers={couriers} />;
}
