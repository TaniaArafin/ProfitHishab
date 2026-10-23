'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatTaka, parseTaka, percent, toTaka, type CategoryDto, type ProductDto } from '@ph/shared';
import { api, fieldError, type ApiError } from '@/lib/client-api';
import { navigateFresh, refreshData } from '@/lib/navigation';
import { SelectField } from '@/components/SelectField';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    } else {
      setError(res.error);
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
    <Card className="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
        {notice ? (
          <Alert variant="success" role="status">
            {notice}
          </Alert>
        ) : null}
        {error && !error.fields ? <Alert variant="destructive">{error.message}</Alert> : null}
        <div>
          <Label htmlFor="name">Product name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required aria-invalid={!!fieldError(error, 'name')} />
          {err('name')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" className="uppercase" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto: PRD-0001" />
            {err('sku')}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
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
              <Input
                className="mt-2"
                aria-label="New category name"
                placeholder="Category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="price">Selling price (৳)</Label>
            <Input id="price" inputMode="decimal" className="tabular" value={price} onChange={(e) => setPrice(e.target.value)} required />
            {err('sellingPrice')}
          </div>
          <div>
            <Label htmlFor="cost">Product cost (৳)</Label>
            <Input id="cost" inputMode="decimal" className="tabular" value={cost} onChange={(e) => setCost(e.target.value)} required />
            {err('costPrice')}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label htmlFor="stock">Stock</Label>
            <Input
              id="stock"
              type="number"
              inputMode="numeric"
              className="tabular"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
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
              Gross profit <strong className={preview.gross >= 0 ? 'text-gain' : 'text-loss'}>{formatTaka(preview.gross)}</strong> per unit
              · margin <strong>{preview.margin}%</strong>
              {costP === 0 ? <span className="ml-1 text-warn">· a cost of 0 overstates profit</span> : null}
            </span>
          ) : (
            <span className="text-ink-muted">Enter price and cost to see the profit per unit.</span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          {product && product.status === 'active' ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="link" className="self-center text-loss hover:text-loss sm:ml-auto">
                  Archive product
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive {product.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It leaves your product list and can&apos;t be added to new orders. Past orders and their profit stay as they are. You
                    can restore it later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep product</AlertDialogCancel>
                  <AlertDialogAction onClick={archive}>Archive product</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {product && product.status === 'archived' ? (
            <Button type="button" variant="link" className="self-center text-ink sm:ml-auto" onClick={restore}>
              Restore product
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
