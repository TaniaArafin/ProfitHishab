import type { Metadata } from 'next';
import { Package } from 'lucide-react';
import type { BatchDto, BusinessDto, CategoryDto, OptionListDto, ProductDto, ProductPriceDto } from '@ph/shared';
import { PriceHistory } from '@/components/PriceHistory';
import { PageHeader } from '@/components/ui';
import { apiGet } from '@/lib/server-api';
import { ProductForm } from '../ProductForm';
import { BatchesCard } from './BatchesCard';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: product }, { data: categories }, { data: prices }, { data: optionLists }, { data: business }] = await Promise.all([
    apiGet<{ data: ProductDto & { pastOrderCount: number } }>(`/products/${id}`),
    apiGet<{ data: CategoryDto[] }>('/categories'),
    apiGet<{ data: ProductPriceDto[] }>(`/products/${id}/prices`),
    apiGet<{ data: OptionListDto[] }>('/option-lists'),
    apiGet<{ data: BusinessDto }>('/business'),
  ]);
  const batches = product.tracksBatches ? (await apiGet<{ data: BatchDto[] }>(`/products/${id}/batches`)).data : [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Package}
        title={product.name}
        description={`${product.sku}${product.status === 'archived' ? ' · Archived' : ''} · used in ${product.pastOrderCount} order${product.pastOrderCount === 1 ? '' : 's'}`}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,48rem)_minmax(0,22rem)]">
        <ProductForm product={product} categories={categories} optionLists={optionLists} businessType={business.businessType} />
        <div className="flex flex-col gap-5">
          {product.tracksBatches ? <BatchesCard product={product} batches={batches} /> : null}
          <PriceHistory prices={prices} />
        </div>
      </div>
    </div>
  );
}
