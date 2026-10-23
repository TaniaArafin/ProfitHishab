import type { Metadata } from 'next';
import { Settings } from 'lucide-react';
import type { BusinessDto, CourierDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { BusinessSettingsForm, CourierRow } from './SettingsForms';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const [{ data: business }, { data: couriers }] = await Promise.all([
    apiGet<{ data: BusinessDto }>('/business'),
    apiGet<{ data: CourierDto[] }>('/couriers'),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Settings} title="Settings" description="Business details, order defaults and couriers." />
      <BusinessSettingsForm business={business} couriers={couriers} />
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Couriers</CardTitle>
          <CardDescription>What each courier charges you. Used to prefill the courier cost on new orders.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-line/60 pt-2 sm:pt-2">
          {couriers.map((c) => (
            <CourierRow key={c.id} courier={c} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
