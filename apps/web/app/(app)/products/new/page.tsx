import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import type { BusinessDto, CategoryDto, OptionListDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { ProductForm } from '../ProductForm';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const [{ data: categories }, { data: optionLists }, { data: business }] = await Promise.all([
    apiGet<{ data: CategoryDto[] }>('/categories'),
    apiGet<{ data: OptionListDto[] }>('/option-lists'),
    apiGet<{ data: BusinessDto }>('/business'),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Package} title="New product" />
      <ProductForm categories={categories} optionLists={optionLists} businessType={business.businessType} />
    </div>
  );
}
