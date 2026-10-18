import type { Metadata } from 'next';
import { Package, Pencil, Plus, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { formatTaka, type CategoryDto, type Paginated, type ProductDto } from '@ph/shared';
import { SelectField } from '@/components/SelectField';
import { Banner, EmptyState, PageHeader, Pagination } from '@/components/ui';
import { apiGet, qs } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Products' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const KEYS = ['q', 'categoryId', 'status', 'costMissing', 'sort', 'page'];

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : 'active';
  const [products, categories, missing] = await Promise.all([
    apiGet<Paginated<ProductDto>>(`/products?${qs({ ...sp, status }, KEYS)}`),
    apiGet<{ data: CategoryDto[] }>('/categories'),
    apiGet<{ data: unknown[] }>('/products/missing-cost'),
  ]);
  const value = (k: string) => (typeof sp[k] === 'string' ? sp[k] : '');
  const keep = Object.fromEntries(KEYS.filter((k) => k !== 'page').map((k) => [k, value(k) || undefined]));
  const filtered = Boolean(value('q') || value('categoryId') || value('costMissing'));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Package}
        title="Products"
        actions={
          <Link href="/products/new" className="btn-primary">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New product
          </Link>
        }
      />

      {missing.data.length > 0 ? (
        <Banner tone="warn">
          <strong>{missing.data.length === 1 ? '1 product has' : `${missing.data.length} products have`} no cost.</strong> Profit for them
          is overstated.{' '}
          <Link href="/products/missing-cost" className="font-semibold underline">
            Fill in costs
          </Link>
        </Banner>
      ) : null}

      <form className="card flex flex-wrap items-end gap-2 p-3" action="/products">
        <div className="min-w-[200px] flex-1">
          <label className="sr-only" htmlFor="q">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input id="q" name="q" className="input pl-10" placeholder="Name or SKU" defaultValue={value('q')} />
          </div>
        </div>
        <label className="sr-only" htmlFor="categoryId">
          Category
        </label>
        <SelectField
          id="categoryId"
          name="categoryId"
          className="w-auto min-w-[10rem]"
          defaultValue={value('categoryId')}
          options={[{ value: '', label: 'All categories' }, ...categories.data.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <label className="sr-only" htmlFor="status">
          Status
        </label>
        <SelectField
          id="status"
          name="status"
          className="w-auto min-w-[8rem]"
          defaultValue={status}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <label className="sr-only" htmlFor="sort">
          Sort
        </label>
        <SelectField
          id="sort"
          name="sort"
          className="w-auto min-w-[10rem]"
          defaultValue={value('sort') || 'name'}
          options={[
            { value: 'name', label: 'Name A–Z' },
            { value: '-margin', label: 'Highest margin' },
            { value: 'margin', label: 'Lowest margin' },
            { value: '-price', label: 'Highest price' },
            { value: 'stock', label: 'Lowest stock' },
            { value: '-created', label: 'Newest' },
          ]}
        />
        <button className="btn-secondary" type="submit">
          Apply
        </button>
      </form>

      {products.data.length === 0 ? (
        filtered || status === 'archived' ? (
          <EmptyState icon={SearchX} title="No products match" body="Try another search or filter." />
        ) : (
          <EmptyState
            icon={Package}
            title="Add your first product"
            body="Enter the selling price and what the product costs you. Profit is calculated from both."
            actions={
              <Link href="/products/new" className="btn-primary">
                New product
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line/70 bg-paper/50">
                  <tr>
                    <th className="th">Product</th>
                    <th className="th hidden sm:table-cell">Category</th>
                    <th className="th text-right">Price</th>
                    <th className="th text-right">Cost</th>
                    <th className="th text-right">Margin</th>
                    <th className="th text-right">Stock</th>
                    <th className="th">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {products.data.map((p) => (
                    <tr key={p.id} className="hover:bg-paper/60">
                      <td className="td">
                        <Link href={`/products/${p.id}`} className="font-medium text-ink hover:underline">
                          {p.name}
                        </Link>
                        <div className="text-xs text-ink-faint">{p.sku}</div>
                      </td>
                      <td className="td hidden text-ink-muted sm:table-cell">{p.categoryName ?? '—'}</td>
                      <td className="td text-right tabular">{formatTaka(p.sellingPrice)}</td>
                      <td className="td text-right tabular">
                        {p.costMissing ? (
                          <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn">Cost missing</span>
                        ) : (
                          formatTaka(p.costPrice)
                        )}
                      </td>
                      <td className={`td text-right tabular ${p.margin < 15 ? 'text-loss' : ''}`}>
                        {p.costMissing ? '—' : `${p.margin}%`}
                      </td>
                      <td className={`td text-right tabular ${p.stock < 0 ? 'font-semibold text-loss' : ''}`}>{p.stock}</td>
                      <td className="td text-right">
                        <Link href={`/products/${p.id}`} className="btn-secondary px-3 py-1.5" aria-label={`Edit ${p.name}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={products.meta.page}
            perPage={products.meta.perPage}
            total={products.meta.total}
            path="/products"
            params={keep}
          />
        </>
      )}
    </div>
  );
}
