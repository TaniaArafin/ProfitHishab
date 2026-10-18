import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import type { CategoryDto, ProductDto, ProductPriceDto } from '@ph/shared';
import { PriceHistory } from '@/components/PriceHistory';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { ProductForm } from '../ProductForm';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: product }, { data: categories }, { data: prices }] = await Promise.all([
    apiGet<{ data: ProductDto & { pastOrderCount: number } }>(`/products/${id}`),
    apiGet<{ data: CategoryDto[] }>('/categories'),
    apiGet<{ data: ProductPriceDto[] }>(`/products/${id}/prices`),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Package}
        title={product.name}
        description={`${product.sku}${product.status === 'archived' ? ' · Archived' : ''} · used in ${product.pastOrderCount} order${product.pastOrderCount === 1 ? '' : 's'}`}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,36rem)_minmax(0,22rem)]">
        <ProductForm product={product} categories={categories} />
        <PriceHistory prices={prices} />
      </div>
    </div>
  );
}
