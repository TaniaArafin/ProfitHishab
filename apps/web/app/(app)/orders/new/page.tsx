import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';
import { todayIn, type BusinessDto, type CourierDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { OrderForm } from './OrderForm';

export const metadata: Metadata = { title: 'New order' };

type Props = { searchParams: Promise<{ phone?: string }> };

export default async function NewOrderPage({ searchParams }: Props) {
  const [{ data: business }, { data: couriers }, { phone }] = await Promise.all([
    apiGet<{ data: BusinessDto }>('/business'),
    apiGet<{ data: CourierDto[] }>('/couriers'),
    searchParams,
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={ShoppingBag} title="New order" description="Takes under a minute. Profit is estimated as you type." />
      <OrderForm
        business={business}
        couriers={couriers.filter((c) => c.isActive)}
        today={todayIn(business.timezone)}
        initialPhone={phone ?? ''}
      />
    </div>
  );
}
