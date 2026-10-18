import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import type { CategoryDto } from '@ph/shared';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { ProductForm } from '../ProductForm';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const { data: categories } = await apiGet<{ data: CategoryDto[] }>('/categories');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader icon={Package} title="New product" />
      <ProductForm categories={categories} />
    </div>
  );
}
