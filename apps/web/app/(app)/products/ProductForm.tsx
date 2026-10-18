'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatTaka, parseTaka, percent, toTaka, type CategoryDto, type ProductDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh, refreshData } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';

type Existing = ProductDto & { pastOrderCount: number };

/** FR-PROD-01/02. On edit, a new price or cost applies from today; past orders keep the price they were made at. */
export function ProductForm({ product, categories }: { product?: Existing; categories: CategoryDto[] }) {
  const router = useRouter();
  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState(product ? String(toTaka(product.sellingPrice)) : '');
  const [cost, setCost] = useState(product ? String(toTaka(product.costPrice)) : '');
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const priceP = parseTaka(price);
  const costP = parseTaka(cost);
  const preview =
    priceP !== null && costP !== null && priceP > 0 ? { gross: priceP - costP, margin: percent(priceP - costP, priceP) } : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    let resolvedCategory: string | null = categoryId || null;
    if (categoryId === '__new' && newCategory.trim()) {
      const created = await api<CategoryDto>('POST', '/categories', { name: newCategory.trim() });
      if (!created.ok) {
        setError(created.error);
        setPending(false);
        return;
      }
      resolvedCategory = created.data.id;
    } else if (categoryId === '__new') {
      resolvedCategory = null;
    }

    const body = {
      name,
      sku: sku.trim() || null,
      categoryId: resolvedCategory,
      sellingPrice: priceP ?? undefined,
      costPrice: costP ?? undefined,
      stock: Number.parseInt(stock, 10) || 0,
    };
    const res = product
      ? await api<ProductDto>('PATCH', `/products/${product.id}`, body)
      : await api<ProductDto>('POST', '/products', body);
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigateFresh(router, '/products');
  }

  async function archive() {
    if (!product) return;
    const res = await api('POST', `/products/${product.id}/archive`);
    if (res.ok) {
      navigateFresh(router, '/products');
    }
  }

  async function restore() {
    if (!product) return;
    const res = await api('PATCH', `/products/${product.id}`, { status: 'active' });
    if (res.ok) {
      setNotice('Product restored. It can be added to orders again.');
      refreshData(router);
    } else {
      setError(res.error);
    }
  }

  const err = (field: string) => (fieldError(error, field) ? <p className="mt-1 text-sm text-loss">{fieldError(error, field)}</p> : null);

  return (
    <form onSubmit={submit} className="card flex max-w-xl flex-col gap-4 p-5" noValidate>
      {notice ? <p className="rounded-md bg-gain-soft px-3 py-2 text-sm text-gain">{notice}</p> : null}
      {error && !error.fields ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm text-loss">{error.message}</p> : null}
      <div>
        <label className="label" htmlFor="name">
          Product name
        </label>
        <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        {err('name')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sku">
            SKU
          </label>
          <input id="sku" className="input uppercase" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto: PRD-0001" />
          {err('sku')}
        </div>
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <SelectField
            id="category"
            value={categoryId}
            onValueChange={setCategoryId}
            options={[
              { value: '', label: 'No category' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
              { value: '__new', label: '+ New category…' },
            ]}
          />
          {categoryId === '__new' ? (
            <input
              className="input mt-2"
              aria-label="New category name"
              placeholder="Category name"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="price">
            Selling price (৳)
          </label>
          <input
            id="price"
            inputMode="decimal"
            className="input tabular"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          {err('sellingPrice')}
        </div>
        <div>
          <label className="label" htmlFor="cost">
            Product cost (৳)
          </label>
          <input id="cost" inputMode="decimal" className="input tabular" value={cost} onChange={(e) => setCost(e.target.value)} required />
          {err('costPrice')}
        </div>
        <div>
          <label className="label" htmlFor="stock">
            Stock
          </label>
          <input id="stock" type="number" className="input tabular" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
      </div>
      {product && ((priceP !== null && priceP !== product.sellingPrice) || (costP !== null && costP !== product.costPrice)) ? (
        <p className="text-sm text-ink-muted">
          The new price applies to orders from today. Earlier orders keep {formatTaka(product.sellingPrice)} and their profit doesn&apos;t
          change.
        </p>
      ) : null}
      <div className="rounded-md bg-paper px-4 py-3 text-sm" aria-live="polite">
        {preview ? (
          <span>
            Gross profit <strong className={preview.gross >= 0 ? 'text-gain' : 'text-loss'}>{formatTaka(preview.gross)}</strong> per unit ·
            margin <strong>{preview.margin}%</strong>
            {costP === 0 ? <span className="ml-1 text-warn">· a cost of 0 overstates profit</span> : null}
          </span>
        ) : (
          <span className="text-ink-muted">Enter price and cost to see the profit per unit.</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
        {product && product.status === 'active' ? (
          <button type="button" className="ml-auto text-sm font-medium text-loss underline" onClick={archive}>
            Archive product
          </button>
        ) : null}
        {product && product.status === 'archived' ? (
          <button type="button" className="ml-auto text-sm font-medium text-ink underline" onClick={restore}>
            Restore product
          </button>
        ) : null}
      </div>
    </form>
  );
}
