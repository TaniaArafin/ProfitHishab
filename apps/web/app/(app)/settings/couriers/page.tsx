import type { Metadata } from 'next';
import type { CourierDto } from '@ph/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/server-api';
import { CourierRow } from './CourierRow';

export const metadata: Metadata = { title: 'Couriers' };

export default async function CouriersSettingsPage() {
  const { data: couriers } = await apiGet<{ data: CourierDto[] }>('/couriers');
  return (
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
  );
}
