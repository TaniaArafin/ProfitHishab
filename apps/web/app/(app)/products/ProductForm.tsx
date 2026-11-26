'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { businessTypeDefaults, formatTaka, parseTaka, type CategoryDto, type OptionListDto, type ProductDto, type Unit } from '@ph/shared';
import { api, type ApiError } from '@/lib/client-api';
import { navigateFresh, refreshData } from '@/lib/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArchiveActions } from './form/ArchiveActions';
import { BasicFields, PlainPricing, TrackingField } from './form/BasicFields';
import { draftsOf, newId, taka, usableOptions, variantRows, type AttributeDraft } from './form/drafts';
import { MoreOptions } from './form/MoreOptions';
import { OptionsEditor } from './form/OptionsEditor';
import { VariantTable } from './form/VariantTable';

type Existing = ProductDto & { pastOrderCount: number };
type Props = { product?: Existing; categories: CategoryDto[]; optionLists?: OptionListDto[]; businessType?: string | null };

const numberOr = (text: string, fallback: number) => (text.trim() === '' ? fallback : Number(text));

/**
 * FR-PROD-01/02 and spec 2026-11-25 §4. A product without options keeps one price, cost and stock;
 * with options (Size, Colour…) each variant has its own. On edit, a new price or cost applies from
 * today; past orders keep the price they were made at.
 */
export function ProductForm({ product, categories, optionLists = [], businessType = null }: Props) {
  const router = useRouter();
  const defaults = businessTypeDefaults(businessType);
  const plainVariant = product && product.options.length === 0 ? product.variants[0] : undefined;
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState<Unit>(product?.unit ?? defaults.unit);
  const [price, setPrice] = useState(product ? taka(plainVariant?.sellingPrice ?? product.sellingPrice) : '');
  const [cost, setCost] = useState(product ? taka(plainVariant?.costPrice ?? product.costPrice) : '');
  const [stock, setStock] = useState(String(plainVariant?.stock ?? (product ? 0 : 0)));
  const [{ options, rows }, setVariants] = useState(() => draftsOf(product));
  const [tracksBatches, setTracksBatches] = useState(product?.tracksBatches ?? defaults.tracksBatches);
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [attributes, setAttributes] = useState<AttributeDraft[]>(() => (product?.attributes ?? []).map((a) => ({ id: newId(), ...a })));
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const priceP = parseTaka(price);
  const costP = parseTaka(cost);
  const hasVariants = usableOptions(options).length > 0;

  async function resolveCategory(): Promise<string | null | false> {
    if (categoryId !== '__new') return categoryId || null;
    if (!newCategory.trim()) return null;
    const created = await api<CategoryDto>('POST', '/categories', { name: newCategory.trim() });
    if (!created.ok) {
      setError(created.error);
      return false;
    }
    return created.data.id;
  }

  function body(category: string | null) {
    const common = {
      name,
      sku: sku.trim() || null,
      categoryId: category,
      unit,
      tracksBatches,
      brand,
      description,
      attributes: attributes.filter((a) => a.label.trim() && a.value.trim()).map(({ label, value }) => ({ label, value })),
    };
    if (!hasVariants) {
      // A tracked product's stock moves only through batches, orders and Clear stock.
      const plain = {
        sellingPrice: priceP ?? undefined,
        costPrice: costP ?? undefined,
        ...(tracksBatches ? {} : { stock: numberOr(stock, 0) }),
      };
      // A product that had options becomes plain again: one new variant replaces them.
      if (product && product.options.length > 0) return { ...common, options: [], variants: [{ optionValues: {}, ...plain }] };
      return { ...common, ...plain };
    }
    return {
      ...common,
      options: usableOptions(options),
      variants: variantRows(options, rows).map(({ values, row }) => ({
        ...(row.id ? { id: row.id } : {}),
        optionValues: values,
        sku: row.sku.trim() || null,
        sellingPrice: parseTaka(row.price) ?? undefined,
        costPrice: parseTaka(row.cost) ?? undefined,
        stock: numberOr(row.stock, 0),
        status: row.active ? 'active' : 'archived',
      })),
    };
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const category = await resolveCategory();
    if (category === false) return setPending(false);
    const payload = body(category);
    const res = product
      ? await api<ProductDto>('PATCH', `/products/${product.id}`, payload)
      : await api<ProductDto>('POST', '/products', payload);
    setPending(false);
    if (!res.ok) return setError(res.error);
    navigateFresh(router, '/products');
  }

  async function setStatus(status: 'active' | 'archived') {
    if (!product) return;
    const res =
      status === 'archived'
        ? await api('POST', `/products/${product.id}/archive`)
        : await api('PATCH', `/products/${product.id}`, { status });
    if (!res.ok) return setError(res.error);
    if (status === 'archived') return navigateFresh(router, '/products');
    setNotice('Product restored. It can be added to orders again.');
    refreshData(router);
  }

  const fieldKeys = Object.keys(error?.fields ?? {});
  const showAlert = error && (fieldKeys.length === 0 || fieldKeys.some((k) => k === 'variants' || k.startsWith('options') || k === '_'));
  const priceChanged =
    product && !hasVariants && ((priceP !== null && priceP !== product.sellingPrice) || (costP !== null && costP !== product.costPrice));

  return (
    <Card className="max-w-3xl">
      <form onSubmit={submit} className="flex flex-col gap-5 p-4 sm:p-5" noValidate>
        {notice ? (
          <Alert variant="success" role="status">
            {notice}
          </Alert>
        ) : null}
        {showAlert ? <Alert variant="destructive">{error.message}</Alert> : null}
        <BasicFields
          {...{ error, name, sku, categories, categoryId, newCategory, unit }}
          onName={setName}
          onSku={setSku}
          onCategory={setCategoryId}
          onNewCategory={setNewCategory}
          onUnit={setUnit}
        />
        <TrackingField checked={tracksBatches} onChange={setTracksBatches} />
        <OptionsEditor
          options={options}
          onChange={(next) => setVariants({ options: next, rows })}
          suggestions={defaults.options}
          optionLists={optionLists}
        />
        {hasVariants ? (
          <VariantTable
            options={options}
            rows={rows}
            onRowsChange={(next) => setVariants({ options, rows: next })}
            unit={unit}
            error={error}
            tracksBatches={tracksBatches}
          />
        ) : (
          <PlainPricing
            {...{ error, unit, price, cost, stock, priceP, costP, tracksBatches }}
            isNew={!product}
            onPrice={setPrice}
            onCost={setCost}
            onStock={setStock}
          />
        )}
        {priceChanged ? (
          <p className="text-sm text-ink-muted">
            The new price applies to orders from today. Earlier orders keep {formatTaka(product.sellingPrice)} and their profit doesn&apos;t
            change.
          </p>
        ) : null}
        <MoreOptions
          {...{ brand, description, attributes }}
          onBrand={setBrand}
          onDescription={setDescription}
          onAttributes={setAttributes}
          suggestions={defaults.attributes}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          {product ? (
            <ArchiveActions
              name={product.name}
              archived={product.status === 'archived'}
              onArchive={() => void setStatus('archived')}
              onRestore={() => void setStatus('active')}
            />
          ) : null}
        </div>
      </form>
    </Card>
  );
}
