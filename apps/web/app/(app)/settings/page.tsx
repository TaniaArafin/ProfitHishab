import type { Metadata } from 'next';
import { Settings } from 'lucide-react';
import type { BusinessDto, CourierDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
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
      <section className="card flex max-w-2xl flex-col gap-3 p-5">
        <div>
          <h2 className="font-semibold">Couriers</h2>
          <p className="text-sm text-ink-muted">What each courier charges you. Used to prefill the courier cost on new orders.</p>
        </div>
        <div className="flex flex-col divide-y divide-line/60">
          {couriers.map((c) => (
            <CourierRow key={c.id} courier={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
